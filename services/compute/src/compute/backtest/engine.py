"""Backtest of one declarative strategy over aligned bars and series (FR-BT-1, FR-BT-2).

Decisions are made at a bar's close and fill at the next bar's open. Signals are evaluated for every bar at once;
the position loop jumps from one entry to the first exit event, searching each holding period with array scans.
"""

import math
from dataclasses import dataclass

import numpy as np

from compute.backtest.arrays import BoolArray, FloatArray, IntArray
from compute.backtest.conditions import evaluate
from compute.backtest.metrics import compute_metrics
from compute.backtest.models import (
    BacktestRequest,
    BacktestResponse,
    EquityPoint,
    ExitReason,
    Level,
    PercentLevel,
    Segment,
    SignalCounts,
    Trade,
)
from compute.deadline import Deadline

_FIRST_WINDOW = 64


@dataclass(frozen=True)
class Market:
    time: IntArray
    open: FloatArray
    high: FloatArray
    low: FloatArray
    close: FloatArray
    columns: dict[str, FloatArray]


@dataclass(frozen=True)
class Exit:
    bar: int
    price: float
    reason: ExitReason


@dataclass(frozen=True)
class Position:
    entry_bar: int
    direction: int  # +1 long, -1 short
    stop: float  # an infinity on the far side when the strategy has none
    target: float


def _floats(values: list[float | None]) -> FloatArray:
    return np.array([math.nan if v is None else v for v in values], dtype=np.float64)


def _market(req: BacktestRequest) -> Market:
    columns = {
        "open": np.array([b.open for b in req.bars], dtype=np.float64),
        "high": np.array([b.high for b in req.bars], dtype=np.float64),
        "low": np.array([b.low for b in req.bars], dtype=np.float64),
        "close": np.array([b.close for b in req.bars], dtype=np.float64),
        "volume": _floats([b.volume for b in req.bars]),
    }
    columns |= {name: _floats(values) for name, values in req.series.items()}
    return Market(
        time=np.array([b.time for b in req.bars], dtype=np.int64),
        open=columns["open"],
        high=columns["high"],
        low=columns["low"],
        close=columns["close"],
        columns=columns,
    )


def _distance(level: Level | None, fill: float, decision_bar: int, market: Market) -> float | None:
    """Distance from the entry fill; NaN when the level's series is unknown or not positive at the decision bar."""
    if level is None:
        return None
    if isinstance(level, PercentLevel):
        return fill * level.percent / 100
    value = float(market.columns[level.name][decision_bar]) * level.multiple
    return value if value > 0 else math.nan


def _first_exit(market: Market, exit_signal: BoolArray, pos: Position, deadline: Deadline) -> Exit:
    """Per bar: a pending exit signal fills at the open, then a gap through the stop, a gap through the target,
    the stop touched intrabar, the target touched intrabar. The stop wins whenever the bar cannot say which came first.
    """
    n, d, stop, target = len(market.close), pos.direction, pos.stop, pos.target
    start, width = pos.entry_bar, _FIRST_WINDOW
    while start < n:
        deadline.check()
        end = min(n, start + width)
        opens, highs, lows = market.open[start:end], market.high[start:end], market.low[start:end]
        pending = exit_signal[start - 1 : end - 1] & (np.arange(start, end) > pos.entry_bar)
        stop_hit = lows <= stop if d > 0 else highs >= stop
        target_hit = highs >= target if d > 0 else lows <= target
        events = pending | stop_hit | target_hit
        if events.any():
            i = int(np.argmax(events))
            bar, opened = start + i, float(opens[i])
            if pending[i]:
                return Exit(bar, opened, "exitSignal")
            if d * (opened - stop) <= 0:
                return Exit(bar, opened, "stopLoss")
            if d * (opened - target) >= 0:
                return Exit(bar, opened, "takeProfit")
            return Exit(bar, stop, "stopLoss") if stop_hit[i] else Exit(bar, target, "takeProfit")
        start, width = end, width * 2
    return Exit(n - 1, float(market.close[n - 1]), "endOfData")


@dataclass(frozen=True)
class Simulation:
    trades: list[Trade]
    entry_bars: list[int]
    equity: FloatArray
    in_position: BoolArray


def _simulate(
    req: BacktestRequest,
    market: Market,
    entry: BoolArray,
    exit_signal: BoolArray,
    deadline: Deadline,
) -> Simulation:
    n, strategy = len(market.close), req.strategy
    d = 1 if strategy.side == "long" else -1
    commission, slippage = req.costs.commission_pct / 100, req.costs.slippage_pct / 100
    decisions = np.flatnonzero(entry[:-1])
    equity, in_position = np.empty(n, dtype=np.float64), np.zeros(n, dtype=bool)
    cash, flat_from, search_from = req.initial_capital, 0, 0
    trades: list[Trade] = []
    entry_bars: list[int] = []
    while True:
        deadline.check()
        idx = int(np.searchsorted(decisions, search_from))
        if idx >= len(decisions):
            break
        decision = int(decisions[idx])
        e = decision + 1
        fill = float(market.open[e]) * (1 + d * slippage)
        stop_dist = _distance(strategy.stop_loss, fill, decision, market)
        target_dist = _distance(strategy.take_profit, fill, decision, market)
        if any(dist is not None and math.isnan(dist) for dist in (stop_dist, target_dist)):
            search_from = e
            continue
        pos = Position(
            entry_bar=e,
            direction=d,
            stop=fill - d * (math.inf if stop_dist is None else stop_dist),
            target=fill + d * (math.inf if target_dist is None else target_dist),
        )
        quantity = req.position_fraction * cash / (fill * (1 + commission))
        cash_held = cash - d * quantity * fill - quantity * fill * commission
        out = _first_exit(market, exit_signal, pos, deadline)
        exit_fill = out.price * (1 - d * slippage)
        cash_after = cash_held + d * quantity * exit_fill - quantity * exit_fill * commission
        equity[flat_from:e] = cash
        equity[e : out.bar] = cash_held + d * quantity * market.close[e : out.bar]
        in_position[e : out.bar] = True
        trades.append(
            Trade(
                side=strategy.side,
                entry_time=int(market.time[e]),
                entry_price=fill,
                exit_time=int(market.time[out.bar]),
                exit_price=exit_fill,
                quantity=quantity,
                pnl=cash_after - cash,
                return_pct=(cash_after - cash) / (quantity * fill * (1 + commission)) * 100,
                bars_held=out.bar - e,
                exit_reason=out.reason,
            )
        )
        entry_bars.append(e)
        cash, flat_from, search_from = cash_after, out.bar, out.bar
    equity[flat_from:] = cash
    return Simulation(trades, entry_bars, equity, in_position)


def _segment(sim: Simulation, market: Market, start: int, end: int) -> Segment:
    base = max(start - 1, 0)
    trades = [t for t, e in zip(sim.trades, sim.entry_bars, strict=True) if start <= e < end]
    return Segment(
        start_time=int(market.time[start]),
        end_time=int(market.time[end - 1]),
        metrics=compute_metrics(sim.equity[base:end], market.time[base:end], sim.in_position[start:end], trades),
    )


def run_backtest(req: BacktestRequest, deadline: Deadline) -> BacktestResponse:
    deadline.check()
    market = _market(req)
    entry = evaluate(req.strategy.entry, market.columns, deadline).true
    exit_signal = (
        np.zeros(len(entry), dtype=bool)
        if req.strategy.exit is None
        else evaluate(req.strategy.exit, market.columns, deadline).true
    )
    sim = _simulate(req, market, entry, exit_signal, deadline)
    n = len(market.close)
    in_sample = out_of_sample = None
    if req.out_of_sample_fraction is not None:
        split = math.floor(n * (1 - req.out_of_sample_fraction))
        in_sample, out_of_sample = _segment(sim, market, 0, split), _segment(sim, market, split, n)
    return BacktestResponse(
        trades=sim.trades,
        equity=[EquityPoint(time=int(t), equity=float(v)) for t, v in zip(market.time, sim.equity, strict=True)],
        metrics=_segment(sim, market, 0, n).metrics,
        signals=SignalCounts(entries=int(entry.sum()), exits=int(exit_signal.sum())),
        in_sample=in_sample,
        out_of_sample=out_of_sample,
    )
