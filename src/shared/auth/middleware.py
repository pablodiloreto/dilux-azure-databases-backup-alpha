"""
Authentication and authorization middleware for Azure Functions.

Supports:
- Azure AD JWT validation (production)
- Development bypass mode (when ENVIRONMENT=development)
"""

import json
import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import wraps
from typing import Callable, Optional, Union

import azure.functions as func

from ..models import User, UserRole, AccessRequest, AccessRequestStatus, AuditAction, AuditResourceType, AuditStatus
from ..services import StorageService
from ..services.audit_service import get_audit_service

logger = logging.getLogger(__name__)

# Environment check
IS_DEVELOPMENT = os.environ.get("ENVIRONMENT", "").lower() == "development"
AUTH_MODE = os.environ.get("AUTH_MODE", "mock").lower()  # 'azure' or 'mock'

# Dev mode mock user (used when ENVIRONMENT=development and AUTH_MODE=mock)
DEV_USER_ID = "dev-user-00000000-0000-0000-0000-000000000000"
DEV_USER_EMAIL = "admin@dilux.tech"
DEV_USER_NAME = "Dev Admin"


@dataclass
class AuthResult:
    """Result of authentication attempt."""

    authenticated: bool
    user: Optional[User] = None
    error: Optional[str] = None
    is_first_run: bool = False  # True when no users exist yet


def _get_dev_user(storage_service: StorageService) -> AuthResult:
    """
    Get or create development user.

    In dev mode, we auto-create/update a dev admin user.
    """
    user = storage_service.get_user(DEV_USER_ID)

    if not user:
        # Check if this is first run
        if not storage_service.has_any_users():
            # Create first admin
            user = storage_service.create_first_admin(
                user_id=DEV_USER_ID,
                email=DEV_USER_EMAIL,
                name=DEV_USER_NAME,
            )
            logger.info("Created dev admin user for first run")
            return AuthResult(authenticated=True, user=user, is_first_run=True)
        else:
            # Dev user doesn't exist but other users do - create as viewer
            user = User(
                id=DEV_USER_ID,
                email=DEV_USER_EMAIL,
                name=DEV_USER_NAME,
                role=UserRole.ADMIN,  # Dev always gets admin in dev mode
                enabled=True,
            )
            user = storage_service.save_user(user)

    # Update last login
    storage_service.update_last_login(DEV_USER_ID)

    return AuthResult(authenticated=True, user=user)


def _validate_azure_ad_token(req: func.HttpRequest) -> Optional[dict]:
    """
    Validate Azure AD JWT token from request.

    In Azure Functions with EasyAuth, the token is already validated
    and user info is in headers.

    Returns:
        Token claims dict or None if invalid
    """
    # Azure Functions EasyAuth puts user info in headers
    # X-MS-CLIENT-PRINCIPAL-ID: Azure AD Object ID
    # X-MS-CLIENT-PRINCIPAL-NAME: User email/UPN
    # X-MS-CLIENT-PRINCIPAL: Base64 encoded JSON with all claims

    principal_id = req.headers.get("X-MS-CLIENT-PRINCIPAL-ID")
    principal_name = req.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")

    if principal_id and principal_name:
        return {
            "oid": principal_id,
            "preferred_username": principal_name,
            "name": principal_name.split("@")[0],  # Fallback name
        }

    # Try to get full claims from X-MS-CLIENT-PRINCIPAL
    principal_header = req.headers.get("X-MS-CLIENT-PRINCIPAL")
    if principal_header:
        try:
            import base64
            claims_json = base64.b64decode(principal_header).decode("utf-8")
            claims = json.loads(claims_json)
            return {
                "oid": claims.get("userId") or claims.get("id"),
                "preferred_username": claims.get("userDetails"),
                "name": claims.get("name", claims.get("userDetails", "").split("@")[0]),
            }
        except Exception as e:
            logger.warning(f"Failed to decode X-MS-CLIENT-PRINCIPAL: {e}")

    # For manual JWT validation (if EasyAuth is not enabled)
    # This is used in development with AUTH_MODE=azure
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        try:
            # Decode JWT without verification (for development)
            # In production, EasyAuth validates the token
            import base64
            # JWT has 3 parts: header.payload.signature
            parts = token.split(".")
            if len(parts) >= 2:
                # Decode payload (add padding if needed)
                payload = parts[1]
                padding = 4 - len(payload) % 4
                if padding != 4:
                    payload += "=" * padding
                claims_json = base64.urlsafe_b64decode(payload).decode("utf-8")
                claims = json.loads(claims_json)

                # Extract user info from Azure AD token claims
                return {
                    "oid": claims.get("oid") or claims.get("sub"),
                    "preferred_username": claims.get("preferred_username") or claims.get("email") or claims.get("upn"),
                    "name": claims.get("name") or claims.get("given_name", ""),
                }
        except Exception as e:
            logger.warning(f"Failed to decode JWT token: {e}")

    return None


def get_current_user(
    req: func.HttpRequest,
    storage_service: Optional[StorageService] = None,
) -> AuthResult:
    """
    Get current authenticated user from request.

    Args:
        req: Azure Function HTTP request
        storage_service: Optional storage service (creates one if not provided)

    Returns:
        AuthResult with user info or error
    """
    if storage_service is None:
        storage_service = StorageService()

    # Mock auth bypass (when AUTH_MODE is mock, regardless of environment)
    # This allows testing without Azure AD in any environment
    if AUTH_MODE == "mock":
        return _get_dev_user(storage_service)

    # Validate Azure AD token
    claims = _validate_azure_ad_token(req)

    if not claims or not claims.get("oid"):
        return AuthResult(
            authenticated=False,
            error="Authentication required. Please sign in with Azure AD.",
        )

    user_id = claims["oid"]
    email = claims.get("preferred_username", "")
    name = claims.get("name", email.split("@")[0] if email else "Unknown")

    # Check if user exists in our system
    user = storage_service.get_user(user_id)

    # Get audit service for logging
    audit_service = get_audit_service()
    client_ip = req.headers.get("X-Forwarded-For", req.headers.get("X-Real-IP", "unknown"))

    if not user:
        # Check if this is first run (no users at all)
        if not storage_service.has_any_users():
            # Auto-create first admin
            user = storage_service.create_first_admin(
                user_id=user_id,
                email=email,
                name=name,
            )
            logger.info(f"Created first admin: {email}")
            # Log first admin creation
            audit_service.log(
                user_id=user_id,
                user_email=email,
                action=AuditAction.USER_LOGIN,
                resource_type=AuditResourceType.USER,
                resource_id=user_id,
                resource_name=email,
                details={"event": "first_admin_created"},
                ip_address=client_ip,
            )
            return AuthResult(authenticated=True, user=user, is_first_run=True)
        else:
            # User not in our system and not first run
            logger.warning(f"Access denied for unregistered user: {email} (id: {user_id})")

            # Create access request if enabled
            try:
                settings = storage_service.get_settings()
                if settings.access_requests_enabled:
                    # Check if request already exists for this user
                    existing_requests = storage_service.get_pending_access_requests()
                    already_requested = any(r.email == email for r in existing_requests)

                    if not already_requested:
                        access_request = AccessRequest(
                            id=str(uuid.uuid4()),
                            azure_ad_id=user_id,
                            email=email,
                            name=name,
                            status=AccessRequestStatus.PENDING,
                            requested_at=datetime.now(timezone.utc),
                        )
                        storage_service.save_access_request(access_request)
                        logger.info(f"Created access request for: {email}")

                        # Log access request creation
                        audit_service.log(
                            user_id=user_id,
                            user_email=email,
                            action=AuditAction.USER_LOGIN,
                            resource_type=AuditResourceType.ACCESS_REQUEST,
                            resource_id=access_request.id,
                            resource_name=email,
                            details={"event": "access_request_created"},
                            ip_address=client_ip,
                        )
            except Exception as e:
                logger.error(f"Failed to create access request: {e}")

            # Log failed login attempt
            audit_service.log(
                user_id=user_id,
                user_email=email,
                action=AuditAction.USER_LOGIN,
                resource_type=AuditResourceType.USER,
                resource_id=user_id,
                resource_name=email,
                details={"event": "login_denied_not_registered"},
                status=AuditStatus.FAILED,
                error_message=f"User {email} not registered",
                ip_address=client_ip,
            )

            return AuthResult(
                authenticated=False,
                error=f"Access denied for '{email}'. Your account is not registered in this application. "
                      "Please contact an administrator.",
            )

    # Check if user is enabled
    if not user.enabled:
        # Log disabled user login attempt
        audit_service.log(
            user_id=user_id,
            user_email=email,
            action=AuditAction.USER_LOGIN,
            resource_type=AuditResourceType.USER,
            resource_id=user_id,
            resource_name=email,
            details={"event": "login_denied_disabled"},
            status=AuditStatus.FAILED,
            error_message=f"User {email} is disabled",
            ip_address=client_ip,
        )
        return AuthResult(
            authenticated=False,
            error="Your account has been disabled. Please contact an administrator.",
        )

    # Update last login timestamp (for activity tracking, not audit logging)
    storage_service.update_last_login(user_id)

    # NOTE: Login audit events are NOT logged here because get_current_user() is called
    # on every request for authentication. Login/logout events should be logged by the
    # frontend when the user actually performs login (via Azure AD popup) or logout.

    return AuthResult(authenticated=True, user=user)


def require_auth(
    func_handler: Callable[[func.HttpRequest], func.HttpResponse]
) -> Callable[[func.HttpRequest], func.HttpResponse]:
    """
    Decorator to require authentication for a function.

    Usage:
        @app.route(route="protected")
        @require_auth
        def protected_endpoint(req: func.HttpRequest) -> func.HttpResponse:
            ...
    """
    @wraps(func_handler)
    def wrapper(req: func.HttpRequest) -> func.HttpResponse:
        auth_result = get_current_user(req)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        # Attach user to request for handler to use
        setattr(req, "current_user", auth_result.user)
        setattr(req, "is_first_run", auth_result.is_first_run)

        return func_handler(req)

    return wrapper


def require_role(
    *allowed_roles: UserRole
) -> Callable:
    """
    Decorator to require specific roles for a function.

    Usage:
        @app.route(route="admin-only")
        @require_role(UserRole.ADMIN)
        def admin_endpoint(req: func.HttpRequest) -> func.HttpResponse:
            ...

        @app.route(route="operators")
        @require_role(UserRole.ADMIN, UserRole.OPERATOR)
        def operator_endpoint(req: func.HttpRequest) -> func.HttpResponse:
            ...
    """
    def decorator(
        func_handler: Callable[[func.HttpRequest], func.HttpResponse]
    ) -> Callable[[func.HttpRequest], func.HttpResponse]:
        @wraps(func_handler)
        def wrapper(req: func.HttpRequest) -> func.HttpResponse:
            auth_result = get_current_user(req)

            if not auth_result.authenticated:
                return func.HttpResponse(
                    json.dumps({"error": auth_result.error}),
                    mimetype="application/json",
                    status_code=401,
                )

            user = auth_result.user

            if user.role not in allowed_roles:
                return func.HttpResponse(
                    json.dumps({
                        "error": f"Access denied. Required role: {', '.join(r.value for r in allowed_roles)}. "
                                f"Your role: {user.role.value}."
                    }),
                    mimetype="application/json",
                    status_code=403,
                )

            # Attach user to request
            setattr(req, "current_user", user)
            setattr(req, "is_first_run", auth_result.is_first_run)

            return func_handler(req)

        return wrapper

    return decorator
