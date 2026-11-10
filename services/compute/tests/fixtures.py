import copy
from collections.abc import Sequence
from typing import Any

DAY_MS = 86_400_000


def bars(rows: list[tuple[float, float, float, float]], start: int = 1_700_000_000_000) -> list[dict[str, Any]]:
    return [
        {"time": start + i * DAY_MS, "open": o, "high": h, "low": low, "close": c, "volume": 1000.0}
        for i, (o, h, low, c) in enumerate(rows)
    ]


def above_zero(name: str) -> dict[str, Any]:
    return {
        "kind": "compare",
        "left": {"kind": "series", "name": name},
        "op": "gt",
        "right": {"kind": "value", "value": 0},
    }


# Hand-computed walk-through (see test_engine.test_hand_computed_backtest).
TEN_BARS = bars(
    [
        (100, 101, 99, 100),
        (100, 103, 99, 102),  # entry decision
        (103, 104, 102, 103),  # long @103, stop 97.85, target 113.3
        (104, 114, 103, 112),  # target hit intrabar @113.3
        (111, 112, 110, 111),  # entry decision
        (105, 107, 104, 106),  # long @105, stop 99.75, target 115.5
        (98, 100, 95, 96),  # opens through the stop: @98; entry decision
        (97, 99, 96, 98),  # long @97; exit decision
        (99, 100, 98, 99),  # exit signal @99 open; entry decision
        (100, 101, 99, 101),  # long @100; end of data @101
    ]
)
TEN_SIG = [0, 1, 0, 0, 1, 0, 1, 0, 1, 1]
TEN_XSIG = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0]


def request(
    rows: list[dict[str, Any]],
    sig: Sequence[float | None],
    xsig: Sequence[float | None] | None = None,
    **strategy: Any,
) -> dict[str, Any]:
    series: dict[str, list[float | None]] = {"sig": list(sig)}
    spec: dict[str, Any] = {"entry": above_zero("sig"), **strategy}
    if xsig is not None:
        series["xsig"] = list(xsig)
        spec["exit"] = above_zero("xsig")
    return {"bars": copy.deepcopy(rows), "series": series, "strategy": spec, "initialCapital": 1000}
