"""
Authentication and authorization middleware for Azure Functions.

Supports:
- Azure AD JWT validation (production)
- Development bypass mode (when ENVIRONMENT=development)
"""

import json
import logging
import os
from dataclasses import dataclass
from functools import wraps
from typing import Callable, Optional, Union

import azure.functions as func

from ..models import User, UserRole
from ..services import StorageService

logger = logging.getLogger(__name__)

# Environment check
IS_DEVELOPMENT = os.environ.get("ENVIRONMENT", "").lower() == "development"

# Dev mode mock user (used when ENVIRONMENT=development)
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
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        # In production, you would validate the JWT here
        # For now, we rely on EasyAuth
        logger.warning("Manual JWT validation not implemented - use EasyAuth")

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

    # Development bypass
    if IS_DEVELOPMENT:
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
            return AuthResult(authenticated=True, user=user, is_first_run=True)
        else:
            # User not in our system and not first run
            return AuthResult(
                authenticated=False,
                error="Access denied. Your account is not registered in this application. "
                      "Please contact an administrator.",
            )

    # Check if user is enabled
    if not user.enabled:
        return AuthResult(
            authenticated=False,
            error="Your account has been disabled. Please contact an administrator.",
        )

    # Update last login
    storage_service.update_last_login(user_id)

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
