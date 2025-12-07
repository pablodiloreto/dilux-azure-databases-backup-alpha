"""Authentication and authorization module."""

from .middleware import (
    get_current_user,
    require_auth,
    require_role,
    AuthResult,
)

__all__ = [
    "get_current_user",
    "require_auth",
    "require_role",
    "AuthResult",
]
