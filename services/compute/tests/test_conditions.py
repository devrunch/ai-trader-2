"""Condition DSL: validation and three-valued evaluation (FR-BT-1)."""

from typing import Any

import numpy as np
import pytest
from pydantic import TypeAdapter, ValidationError

from compute.backtest.conditions import evaluate
from compute.backtest.models import Condition, Strategy
from compute.deadline import Deadline

NAN = float("nan")
CONDITION: TypeAdapter[Condition] = TypeAdapter(Condition)


def cond(raw: dict[str, Any]) -> Condition:
    return CONDITION.validate_python(raw)


def series(name: str, offset: int = 0) -> dict[str, Any]:
    return {"kind": "series", "name": name, "offset": offset}


def value(v: float) -> dict[str, Any]:
    return {"kind": "value", "value": v}


def compare(left: dict[str, Any], op: str, right: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "compare", "left": left, "op": op, "right": right}


COLUMNS = {
    "a": np.array([1.0, 2.0, 3.0, 2.0, NAN, 5.0]),
    "b": np.array([2.0, 2.0, 2.0, 2.0, 2.0, 2.0]),
}


def fire(raw: dict[str, Any]) -> list[bool]:
    return [bool(v) for v in evaluate(cond(raw), COLUMNS, Deadline.after(5)).true]


@pytest.mark.parametrize(
    ("op", "expected"),
    [
        ("gt", [False, False, True, False, False, True]),
        ("gte", [False, True, True, True, False, True]),
        ("lt", [True, False, False, False, False, False]),
        ("lte", [True, True, False, True, False, False]),
        ("eq", [False, True, False, True, False, False]),
        ("neq", [True, False, True, False, False, True]),
    ],
)
def test_compares_series_bar_by_bar_and_never_fires_on_unknown(op: str, expected: list[bool]) -> None:
    assert fire(compare(series("a"), op, series("b"))) == expected


def test_compares_against_a_constant() -> None:
    assert fire(compare(series("a"), "gte", value(3))) == [False, False, True, False, False, True]


def test_crosses_above_needs_the_previous_bar_at_or_below() -> None:
    # a: 1 2 3 2 nan 5 vs 2: crosses at bar 2 only; bar 5 follows an unknown bar.
    assert fire(compare(series("a"), "crossesAbove", series("b"))) == [False, False, True, False, False, False]


def test_crosses_below_needs_the_previous_bar_at_or_above() -> None:
    assert fire(compare(series("a"), "crossesBelow", value(2.5))) == [False, False, False, True, False, False]


def test_offset_reads_earlier_bars_and_is_unknown_before_the_first() -> None:
    # a[i-1] < a[i]
    assert fire(compare(series("a", 1), "lt", series("a"))) == [False, True, True, False, False, False]


def test_not_of_unknown_stays_unknown() -> None:
    result = evaluate(cond({"kind": "not", "of": compare(series("a"), "gt", series("b"))}), COLUMNS, Deadline.after(5))
    assert result.true.tolist() == [True, True, False, True, False, False]
    assert result.false.tolist() == [False, False, True, False, False, True]


def test_all_is_false_if_any_part_is_false_even_when_another_is_unknown() -> None:
    raw = {"kind": "all", "of": [compare(series("a"), "gt", value(0)), compare(series("b"), "gt", value(5))]}
    result = evaluate(cond(raw), COLUMNS, Deadline.after(5))
    assert result.true.tolist() == [False] * 6
    assert result.false.tolist() == [True] * 6


def test_any_is_true_if_any_part_is_true_even_when_another_is_unknown() -> None:
    raw = {"kind": "any", "of": [compare(series("a"), "gt", value(0)), compare(series("b"), "gt", value(0))]}
    assert fire(raw) == [True] * 6


def test_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError, match="extra"):
        cond({**compare(series("a"), "gt", value(1)), "typo": 1})


def test_rejects_unknown_operators() -> None:
    with pytest.raises(ValidationError):
        cond(compare(series("a"), "above", value(1)))


def test_rejects_bad_series_names() -> None:
    with pytest.raises(ValidationError):
        cond(compare(series("1abc"), "gt", value(1)))


def nested(depth: int) -> dict[str, Any]:
    node = compare(series("close"), "gt", value(1))
    for _ in range(depth):
        node = {"kind": "not", "of": node}
    return node


def test_accepts_a_tree_at_the_depth_limit() -> None:
    Strategy.model_validate({"entry": nested(7)})


def test_rejects_a_tree_deeper_than_the_limit() -> None:
    with pytest.raises(ValidationError, match="deeper than 8"):
        Strategy.model_validate({"entry": nested(8)})


def test_rejects_more_than_64_nodes_across_entry_and_exit() -> None:
    leaves = [compare(series("close"), "gt", value(i)) for i in range(32)]
    with pytest.raises(ValidationError, match="more than 64 nodes"):
        Strategy.model_validate({"entry": {"kind": "all", "of": leaves}, "exit": {"kind": "any", "of": leaves}})
