from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from compute.observability import REQUEST_ID

ErrorCode = Literal["VALIDATION_FAILED", "NOT_FOUND", "UNAVAILABLE", "INTERNAL"]


class ErrorDetail(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class ErrorBody(BaseModel):
    """The error shape shared with the Node API (SRD 11)."""

    code: ErrorCode
    message: str
    details: list[ErrorDetail] | None = None
    requestId: str  # noqa: N815 - wire name


class ComputeError(Exception):
    def __init__(self, status: int, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_response(
    status: int,
    code: ErrorCode,
    message: str,
    details: list[ErrorDetail] | None = None,
) -> JSONResponse:
    body = ErrorBody(code=code, message=message, details=details, requestId=REQUEST_ID.get() or "")
    return JSONResponse(body.model_dump(exclude_none=True), status_code=status)


def _code_for(status: int) -> ErrorCode:
    if status == 404:
        return "NOT_FOUND"
    if status >= 500:
        return "INTERNAL"
    return "VALIDATION_FAILED"


async def _http_error(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        raise exc
    return error_response(exc.status_code, _code_for(exc.status_code), str(exc.detail))


async def _validation_error(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    details = [ErrorDetail(loc=list(e["loc"]), msg=str(e["msg"]), type=str(e["type"])) for e in exc.errors()]
    return error_response(422, "VALIDATION_FAILED", "Request validation failed", details)


async def _compute_error(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ComputeError):
        raise exc
    return error_response(exc.status, exc.code, exc.message)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(ComputeError, _compute_error)
