import logging
import re
import uuid
from time import perf_counter

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from compute.errors import error_response
from compute.observability import REQUEST_ID

_SAFE_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")
access_log = logging.getLogger("compute.access")
log = logging.getLogger("compute.errors")


class RequestContextMiddleware:
    """Request id (accepted or generated, echoed), a body-size cap, and one access-log line per request.

    The body is buffered up to the cap before the app runs, so an oversized body never reaches parsing.
    """

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        supplied = Headers(scope=scope).get("x-request-id", "")
        request_id = supplied if _SAFE_ID.fullmatch(supplied) else uuid.uuid4().hex
        token = REQUEST_ID.set(request_id)
        started = perf_counter()
        status = 500
        status_sent = False

        async def send_with_id(message: Message) -> None:
            nonlocal status, status_sent
            if message["type"] == "http.response.start":
                status, status_sent = message["status"], True
                MutableHeaders(scope=message)["x-request-id"] = request_id
            await send(message)

        try:
            body = await self._read_body(receive)
            if body is None:
                response = error_response(
                    413,
                    "VALIDATION_FAILED",
                    f"Request body exceeds {self.max_body_bytes} bytes",
                )
                await response(scope, receive, send_with_id)
                return
            await self.app(scope, _replay(body, receive), send_with_id)
        except Exception:
            log.exception("unhandled error")
            if status_sent:
                raise
            await error_response(500, "INTERNAL", "Internal error")(scope, receive, send_with_id)
        finally:
            access_log.info(
                "request",
                extra={
                    "requestId": request_id,
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "durationMs": round((perf_counter() - started) * 1000, 3),
                },
            )
            REQUEST_ID.reset(token)

    async def _read_body(self, receive: Receive) -> bytes | None:
        chunks = bytearray()
        while True:
            message = await receive()
            if message["type"] != "http.request":
                return bytes(chunks)
            chunks += message.get("body", b"")
            if len(chunks) > self.max_body_bytes:
                return None
            if not message.get("more_body", False):
                return bytes(chunks)


def _replay(body: bytes, receive: Receive) -> Receive:
    sent = False

    async def replay() -> Message:
        nonlocal sent
        if sent:
            return await receive()
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return replay
