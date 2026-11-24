"""Refuse request bodies that are too large before any work is done.

Field limits in the schemas give clear messages for normal forms. This is the
outer guard for everything else (report block data, imports), so one request
cannot make the server parse or build from a huge body.
"""

import json

from starlette.types import ASGIApp, Receive, Scope, Send

MAX_JSON_BYTES = 5 * 1024 * 1024        # report exports carry block data
MAX_MULTIPART_BYTES = 12 * 1024 * 1024  # evidence files are capped at 10 MB


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in ("POST", "PUT", "PATCH"):
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        ctype = headers.get(b"content-type", b"").decode("latin-1").lower()
        limit = MAX_MULTIPART_BYTES if ctype.startswith("multipart/") else MAX_JSON_BYTES

        declared = headers.get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await _too_large(send, limit)
            return

        # Browsers and Render's proxy always send Content-Length for these
        # bodies; the upload routes also read at most their own cap.
        await self.app(scope, receive, send)


async def _too_large(send: Send, limit: int) -> None:
    body = json.dumps({
        "data": None,
        "error": f"The request is too large. The limit is {limit // (1024 * 1024)} MB.",
        "meta": {},
    }).encode()
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})
