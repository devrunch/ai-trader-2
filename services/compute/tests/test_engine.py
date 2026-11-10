"""Backtest engine rules (FR-BT-1, FR-BT-2)."""

import math
from typing import Any

import numpy as np
import pytest

from compute.backtest.engine import run_backtest
from compute.backtest.models import BacktestRequest, BacktestResponse
from compute.deadline import Deadline, DeadlineExceeded
from tests.fixtures import DAY_MS, TEN_BARS, TEN_SIG, TEN_XSIG, bars, request

PCT5 = {"kind": "percent", "percent": 5}
PCT10 = {"kind": "percent", "percent": 10}


def run(raw: dict[str, Any]) -> BacktestResponse:
    return run_backtest(BacktestRequest.model_validate(raw), Deadline.after(5))


def hand_computed() -> BacktestResponse:
    return run(request(TEN_BARS, TEN_SIG, TEN_XSIG, stopLoss=PCT5, takeProfit=PCT10))


def test_hand_computed_backtest_trades() -> None:
    result = hand_computed()
    t = TEN_BARS
    got = [
        (tr.entry_time, tr.entry_price, tr.exit_time, tr.exit_price, tr.exit_reason, tr.bars_held)
        for tr in result.trades
    ]
    assert got == [
        (t[2]["time"], 103, t[3]["time"], pytest.approx(113.3), "takeProfit", 1),
        (t[5]["time"], 105, t[6]["time"], 98, "stopLoss", 1),
        (t[7]["time"], 97, t[8]["time"], 99, "exitSignal", 1),
        (t[9]["time"], 100, t[9]["time"], 101, "endOfData", 0),
    ]
    e1 = 1000 * 113.3 / 103
    e2 = e1 * 98 / 105
    e3 = e2 * 99 / 97
    e4 = e3 * 101 / 100
    assert [tr.pnl for tr in result.trades] == pytest.approx([e1 - 1000, e2 - e1, e3 - e2, e4 - e3])
    assert [tr.return_pct for tr in result.trades] == pytest.approx([10, (98 / 105 - 1) * 100, (99 / 97 - 1) * 100, 1])
    assert result.trades[0].quantity == pytest.approx(1000 / 103)
    assert all(tr.side == "long" for tr in result.trades)


def expected_curve() -> list[float]:
    e1 = 1000 * 113.3 / 103
    e2 = e1 * 98 / 105
    e3 = e2 * 99 / 97
    return [1000, 1000, 1000, e1, e1, e1 * 106 / 105, e2, e2 * 98 / 97, e3, e3 * 101 / 100]


def test_hand_computed_backtest_equity_is_marked_at_each_close() -> None:
    result = hand_computed()
    assert [p.time for p in result.equity] == [b["time"] for b in TEN_BARS]
    assert [p.equity for p in result.equity] == pytest.approx(expected_curve())


def test_hand_computed_backtest_metrics() -> None:
    m = hand_computed().metrics
    curve = np.array(expected_curve())
    years = 9 * DAY_MS / (365.25 * DAY_MS)
    returns = np.diff(curve) / curve[:-1]
    assert m.trade_count == 4
    assert m.final_equity == pytest.approx(curve[-1])
    assert m.total_return_pct == pytest.approx((curve[-1] / 1000 - 1) * 100)
    assert m.cagr_pct == pytest.approx(((curve[-1] / 1000) ** (1 / years) - 1) * 100)
    assert m.max_drawdown_pct == pytest.approx((curve[5] - curve[6]) / curve[5] * 100)
    assert m.sharpe == pytest.approx(returns.mean() / returns.std(ddof=1) * math.sqrt(9 / years))
    assert m.win_rate_pct == 75
    wins = (curve[3] - 1000) + (curve[8] - curve[6]) + (curve[9] - curve[8])
    assert m.profit_factor == pytest.approx(wins / (curve[3] - curve[6]))
    assert m.exposure_pct == 30
    assert hand_computed().signals.model_dump() == {"entries": 5, "exits": 1}


def test_costs_apply_to_both_fills() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (110, 120, 110, 120)])
    raw = request(rows, [1, 0, 0]) | {"costs": {"commissionPct": 0.1, "slippagePct": 0.5}}
    trade = run(raw).trades[0]
    entry = 100 * 1.005
    qty = 1000 / (entry * 1.001)
    exit_ = 120 * 0.995
    cash = 1000 - qty * entry * 1.001 + qty * exit_ * 0.999
    assert trade.entry_price == pytest.approx(entry)
    assert trade.exit_price == pytest.approx(exit_)
    assert trade.pnl == pytest.approx(cash - 1000)


def test_a_bar_that_opens_through_the_stop_fills_at_the_open() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (90, 91, 80, 85)])
    trade = run(request(rows, [1, 0, 0], stopLoss=PCT5)).trades[0]
    assert (trade.exit_price, trade.exit_reason) == (90, "stopLoss")


def test_stop_is_checked_before_target_within_a_bar() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (100, 120, 90, 100)])
    trade = run(request(rows, [1, 0, 0], stopLoss=PCT5, takeProfit=PCT10)).trades[0]
    assert (trade.exit_price, trade.exit_reason) == (95, "stopLoss")


def test_a_bar_that_opens_through_the_target_fills_at_the_open() -> None:
    rows = bars([(100, 100, 100, 100), (100, 101, 100, 100), (120, 121, 80, 100)])
    trade = run(request(rows, [1, 0, 0], stopLoss=PCT5, takeProfit=PCT10)).trades[0]
    assert trade.entry_price == 100
    assert (trade.exit_price, trade.exit_reason) == (120, "takeProfit")


def test_short_side_mirrors_fills_stops_and_pnl() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (100, 103, 95, 97), (108, 110, 100, 105)])
    result = run(request(rows, [1, 0, 0, 0], side="short", stopLoss=PCT5, takeProfit=PCT10))
    trade = result.trades[0]
    assert trade.side == "short"
    assert (trade.exit_price, trade.exit_reason) == (108, "stopLoss")
    assert trade.pnl == pytest.approx(-80)
    assert [p.equity for p in result.equity] == pytest.approx([1000, 1000, 1030, 920])


def test_a_series_level_uses_the_value_at_the_decision_bar() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (100, 100, 93, 95), (95, 95, 89, 90)])
    raw = request(rows, [0, 1, 0, 0], stopLoss={"kind": "series", "name": "atr", "multiple": 2})
    raw["series"]["atr"] = [None, 3, 50, 50]
    trade = run(raw).trades[0]
    assert (trade.exit_price, trade.exit_reason) == (94, "stopLoss")


def test_skips_an_entry_whose_level_is_unknown_at_the_decision_bar() -> None:
    rows = bars([(100, 100, 100, 100)] * 4)
    raw = request(rows, [1, 1, 0, 0], stopLoss={"kind": "series", "name": "atr", "multiple": 2})
    raw["series"]["atr"] = [None, 3, 3, 3]
    trades = run(raw).trades
    assert [tr.entry_time for tr in trades] == [rows[2]["time"]]


def test_ignores_an_entry_signal_on_the_last_bar() -> None:
    rows = bars([(100, 100, 100, 100)] * 3)
    assert run(request(rows, [0, 0, 1])).trades == []


def test_exit_signal_wins_over_a_same_bar_entry_signal_while_in_position() -> None:
    rows = bars([(100, 100, 100, 100)] * 5)
    result = run(request(rows, [1, 1, 1, 0, 0], [0, 0, 1, 0, 0]))
    assert [(tr.entry_time, tr.exit_time) for tr in result.trades] == [(rows[1]["time"], rows[3]["time"])]


def test_unknown_series_values_never_open_a_trade() -> None:
    rows = bars([(100, 100, 100, 100)] * 4)
    raw = request(rows, [None, None, None, None])
    raw["strategy"]["entry"] = {"kind": "not", "of": raw["strategy"]["entry"]}
    assert run(raw).trades == []


def test_position_fraction_scales_the_position() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (100, 110, 100, 110)])
    result = run(request(rows, [1, 0, 0]) | {"positionFraction": 0.5})
    assert result.trades[0].quantity == pytest.approx(5)
    assert result.metrics.final_equity == pytest.approx(1050)


def test_no_lookahead_later_bars_do_not_change_earlier_results() -> None:
    base = hand_computed()
    changed_rows = [*TEN_BARS[:9], {**TEN_BARS[9], "open": 50, "low": 40, "close": 45}]
    changed = run(request(changed_rows, TEN_SIG, TEN_XSIG, stopLoss=PCT5, takeProfit=PCT10))
    assert changed.trades[:3] == base.trades[:3]
    assert changed.equity[:9] == base.equity[:9]


def test_is_deterministic() -> None:
    assert hand_computed().model_dump_json() == hand_computed().model_dump_json()


def test_metrics_are_null_where_undefined() -> None:
    rows = bars([(100, 100, 100, 100)] * 3)
    m = run(request(rows, [0, 0, 0])).metrics
    assert (m.trade_count, m.win_rate_pct, m.profit_factor, m.sharpe) == (0, None, None, None)
    assert (m.total_return_pct, m.max_drawdown_pct, m.exposure_pct, m.cagr_pct) == (0, 0, 0, 0)


def test_splits_metrics_in_and_out_of_sample() -> None:
    raw = request(TEN_BARS, TEN_SIG, TEN_XSIG, stopLoss=PCT5, takeProfit=PCT10) | {"outOfSampleFraction": 0.3}
    result = run(raw)
    assert result.in_sample is not None
    assert result.out_of_sample is not None
    curve = expected_curve()
    ins, oos = result.in_sample, result.out_of_sample
    assert (ins.start_time, ins.end_time) == (TEN_BARS[0]["time"], TEN_BARS[6]["time"])
    assert (oos.start_time, oos.end_time) == (TEN_BARS[7]["time"], TEN_BARS[9]["time"])
    assert ins.metrics.trade_count == 2
    assert oos.metrics.trade_count == 2
    assert ins.metrics.final_equity == pytest.approx(curve[6])
    assert oos.metrics.total_return_pct == pytest.approx((curve[9] / curve[6] - 1) * 100)
    assert oos.metrics.exposure_pct == pytest.approx(100 / 3)


def test_stops_when_the_deadline_passes() -> None:
    with pytest.raises(DeadlineExceeded):
        run_backtest(BacktestRequest.model_validate(request(TEN_BARS, TEN_SIG)), Deadline.after(0))


def test_cagr_is_null_when_the_span_is_too_short_to_annualise() -> None:
    rows = bars([(100, 100, 100, 100), (100, 100, 100, 100), (200, 200, 200, 200)], start=0)
    rows = [{**b, "time": i * 60_000} for i, b in enumerate(rows)]
    m = run(request(rows, [1, 0, 0])).metrics
    assert m.total_return_pct == pytest.approx(100)
    assert m.cagr_pct is None
