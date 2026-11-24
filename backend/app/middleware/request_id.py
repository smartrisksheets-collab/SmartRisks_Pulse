"""Give every request an id, in the logs and in the X-Request-ID reply header.

Plain ASGI middleware (not BaseHTTPMiddleware), so the id is set in the same
context the route and its log lines run in.
"""

import re
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging_config import request_id_var

# Accept an id from a proxy only when it is short and plain.
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = ""
        for key, value in scope.get("headers", []):
            if key == b"x-request-id":
                incoming = value.decode("latin-1")
                break
        rid = incoming if _SAFE_ID.match(incoming) else uuid.uuid4().hex[:16]
        scope.setdefault("state", {})["request_id"] = rid
        token = request_id_var.set(rid)

        async def _send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", rid.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, _send)
        finally:
            request_id_var.reset(token)
