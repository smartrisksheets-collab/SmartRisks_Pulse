from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.core.security import decode_token


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            claims = decode_token(auth[7:])
            request.state.tenant_id = claims.get("active_tenant_id")
            request.state.account_id = claims.get("sub")
            request.state.claims = claims
        else:
            request.state.tenant_id = None
            request.state.account_id = None
            request.state.claims = {}
        return await call_next(request)
