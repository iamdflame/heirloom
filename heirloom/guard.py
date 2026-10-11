"""Deny-by-default publishing guard.

Every GitHub write and every ``git push`` calls :func:`check`. Publishing is only
allowed inside :func:`publishing` for a line whose spec says ``publish=True``
(release lines). Eval and distro lines can therefore never open an issue or PR
or push, even through a code path that forgot to look at the line.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from heirloom.config import LineSpec

_ALLOWED: ContextVar[str | None] = ContextVar("heirloom_publish_line", default=None)


class PublishForbidden(RuntimeError):
    pass


@contextmanager
def publishing(spec: LineSpec) -> Iterator[None]:
    token = _ALLOWED.set(spec.name if spec.publish else None)
    try:
        yield
    finally:
        _ALLOWED.reset(token)


def check(action: str) -> None:
    if _ALLOWED.get() is None:
        raise PublishForbidden(f"{action}: the current line may not publish")


def allowed() -> bool:
    return _ALLOWED.get() is not None
