import ipaddress

from slowapi import Limiter
from starlette.requests import Request
from app.core.config import settings


def _is_trusted(client_host: str) -> bool:
    """
    Returns True if client_host matches any entry in TRUSTED_PROXY_IPS.
    Each entry can be an exact IP (108.198.46.150) or a CIDR range (10.0.0.0/8).
    """
    try:
        addr = ipaddress.ip_address(client_host)
    except ValueError:
        return False
    for entry in settings.trusted_proxy_list:
        try:
            if addr in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


def _rate_limit_key(request: Request) -> str:
    client_host = request.client.host if request.client else "unknown"
    if _is_trusted(client_host):
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
    return client_host


limiter = Limiter(key_func=_rate_limit_key)