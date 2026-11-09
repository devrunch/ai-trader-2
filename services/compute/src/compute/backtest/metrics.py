"""Performance metrics over a close-marked equity curve.

Definitions: docs/superpowers/plans/2026-11-09-phase-6-compute.md.
"""

import math
from collections.abc import Sequence

import numpy as np

from compute.backtest.arrays import BoolArray, FloatArray, IntArray
from compute.backtest.models import Metrics, Trade

YEAR_MS = 365.25 * 86_400_000
_MAX_EXPONENT = 700.0


def compute_metrics(
    curve: FloatArray,
    times: IntArray,
    in_position: BoolArray,
    trades: Sequence[Trade],
) -> Metrics:
    """`curve` is close-marked equity, starting at the close before the segment when there is one.

    `times` are the bar times of `curve`; `in_position` covers the segment's own bars.
    """
    ratio = float(curve[-1] / curve[0])
    years = float(times[-1] - times[0]) / YEAR_MS
    peaks = np.maximum.accumulate(curve)
    pnls = [t.pnl for t in trades]
    gross_win = sum(p for p in pnls if p > 0)
    gross_loss = -sum(p for p in pnls if p < 0)
    return Metrics(
        total_return_pct=(ratio - 1) * 100,
        cagr_pct=_cagr(ratio, years),
        max_drawdown_pct=float(np.max((peaks - curve) / peaks)) * 100,
        sharpe=_sharpe(curve, years),
        win_rate_pct=sum(p > 0 for p in pnls) / len(pnls) * 100 if pnls else None,
        profit_factor=gross_win / gross_loss if gross_loss > 0 else None,
        exposure_pct=float(in_position.mean()) * 100 if in_position.size else 0.0,
        trade_count=len(trades),
        final_equity=float(curve[-1]),
    )


def _cagr(ratio: float, years: float) -> float | None:
    if years <= 0:
        return None
    if ratio <= 0:
        return -100.0
    exponent = math.log(ratio) / years
    if exponent > _MAX_EXPONENT:  # a span too short to annualise
        return None
    return math.expm1(exponent) * 100


def _sharpe(curve: FloatArray, years: float) -> float | None:
    if len(curve) < 3 or years <= 0 or np.any(curve[:-1] <= 0):
        return None
    returns = np.diff(curve) / curve[:-1]
    std = float(returns.std(ddof=1))
    if std == 0:
        return None
    return float(returns.mean()) / std * math.sqrt(len(returns) / years)
