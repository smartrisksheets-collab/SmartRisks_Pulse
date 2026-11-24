"""One logging setup for the whole app, done once at import of app.main.

Before this, nothing configured logging, so Python dropped every info line and
printed warnings with no time or source. Every line now carries the time, the
level, the logger name and the request id, so one failing request can be
followed through Render's log viewer.
"""

import logging
import sys
from contextvars import ContextVar

# Set per request by RequestIdMiddleware; "-" outside a request (jobs, startup).
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s req=%(request_id)s %(message)s"
    ))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # Third-party libraries that are noisy at info.
    for name in ("httpx", "httpcore", "apscheduler", "asyncio"):
        logging.getLogger(name).setLevel(logging.WARNING)
