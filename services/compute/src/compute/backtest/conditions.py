"""Three-valued evaluation of a condition tree over aligned float columns.

NaN means unknown (an indicator still warming up). A bar is `true`, `false`, or neither; only `true` fires.
"""

from collections.abc import Mapping
from dataclasses import dataclass

import numpy as np

from compute.backtest.arrays import BoolArray, FloatArray
from compute.backtest.models import AllOf, AnyOf, Compare, Condition, Not, Operand, SeriesOperand
from compute.deadline import Deadline


@dataclass(frozen=True)
class Truth:
    true: BoolArray
    false: BoolArray


def shift(values: FloatArray, bars: int) -> FloatArray:
    if bars == 0:
        return values
    out = np.full_like(values, np.nan)
    out[bars:] = values[:-bars]
    return out


def _operand(operand: Operand, columns: Mapping[str, FloatArray], n: int) -> FloatArray:
    if isinstance(operand, SeriesOperand):
        return shift(columns[operand.name], min(operand.offset, n))
    return np.full(n, operand.value)


def _compare(node: Compare, columns: Mapping[str, FloatArray], n: int) -> Truth:
    left, right = _operand(node.left, columns, n), _operand(node.right, columns, n)
    known = ~np.isnan(left) & ~np.isnan(right)
    with np.errstate(invalid="ignore"):
        match node.op:
            case "gt":
                result = left > right
            case "gte":
                result = left >= right
            case "lt":
                result = left < right
            case "lte":
                result = left <= right
            case "eq":
                result = left == right
            case "neq":
                result = left != right
            case "crossesAbove" | "crossesBelow":
                prev_left, prev_right = shift(left, 1), shift(right, 1)
                known &= ~np.isnan(prev_left) & ~np.isnan(prev_right)
                if node.op == "crossesAbove":
                    result = (left > right) & (prev_left <= prev_right)
                else:
                    result = (left < right) & (prev_left >= prev_right)
    return Truth(true=known & result, false=known & ~result)


def evaluate(node: Condition, columns: Mapping[str, FloatArray], deadline: Deadline) -> Truth:
    deadline.check()
    n = len(next(iter(columns.values())))
    if isinstance(node, Compare):
        return _compare(node, columns, n)
    if isinstance(node, Not):
        inner = evaluate(node.of, columns, deadline)
        return Truth(true=inner.false, false=inner.true)
    parts = [evaluate(child, columns, deadline) for child in node.of]
    trues = np.array([p.true for p in parts])
    falses = np.array([p.false for p in parts])
    if isinstance(node, AllOf):
        return Truth(true=trues.all(axis=0), false=falses.any(axis=0))
    if isinstance(node, AnyOf):
        return Truth(true=trues.any(axis=0), false=falses.all(axis=0))
    raise TypeError(node)
