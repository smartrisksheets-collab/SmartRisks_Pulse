"""Run blocking work (email sends) off the event loop.

The server answers every user on one event loop. A blocking call there, such
as an HTTP request to Resend, makes every other user wait until it returns.
"""

import asyncio
import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

# Strong references to running tasks. asyncio keeps only weak references, so a
# task with no other reference can be dropped before it finishes.
_TASKS: set[asyncio.Task[Any]] = set()


async def _run(fn: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
    try:
        await asyncio.to_thread(fn, *args, **kwargs)
    except Exception:
        logger.exception("background call failed | %s", getattr(fn, "__qualname__", fn))


def run_in_background(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    """Start fn in a worker thread and return at once. Failures are logged.

    With no running event loop (already in a worker thread, a script, or a
    BackgroundTasks job), fn runs inline and its errors reach the caller.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        fn(*args, **kwargs)
        return
    task = loop.create_task(_run(fn, args, kwargs))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
