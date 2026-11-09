import anyio
from fastapi import APIRouter, Request

from compute.backtest.engine import run_backtest
from compute.backtest.models import BacktestRequest, BacktestResponse
from compute.deadline import Deadline, DeadlineExceeded
from compute.errors import ComputeError, ErrorBody
from compute.limits import Limits

router = APIRouter(prefix="/compute/v1")


@router.post(
    "/backtest",
    operation_id="backtest",
    responses={413: {"model": ErrorBody}, 422: {"model": ErrorBody}, 504: {"model": ErrorBody}},
)
async def backtest(body: BacktestRequest, request: Request) -> BacktestResponse:
    """Backtest one strategy; deterministic, pessimistic fills (FR-BT-1, FR-BT-2)."""
    limits: Limits = request.app.state.limits
    deadline = Deadline.after(limits.request_timeout_s)
    try:
        with anyio.fail_after(limits.request_timeout_s):
            return await anyio.to_thread.run_sync(run_backtest, body, deadline, abandon_on_cancel=True)
    except (TimeoutError, DeadlineExceeded):
        raise ComputeError(504, "UNAVAILABLE", f"Backtest exceeded {limits.request_timeout_s:g} s") from None
