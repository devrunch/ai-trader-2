"""Backtest wire contract. camelCase on the wire, like @aitrader/contracts; bar times are epoch milliseconds."""

from collections.abc import Iterator
from itertools import pairwise
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

MAX_BARS = 100_000
MAX_SERIES = 32
MAX_NODES = 64
MAX_DEPTH = 8
MAX_OFFSET = 500
BAR_FIELDS = frozenset({"open", "high", "low", "close", "volume"})

SeriesName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,31}$")]


class Wire(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        extra="forbid",
        allow_inf_nan=False,
        frozen=True,
    )


class Bar(Wire):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None
    repaired: bool | None = None

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if self.high < max(self.open, self.close, self.low):
            raise ValueError("high must be >= open, close and low")
        if self.low > min(self.open, self.close):
            raise ValueError("low must be <= open and close")
        return self


class SeriesOperand(Wire):
    """A bar field or a caller-supplied series, `offset` bars back (0 = the current bar)."""

    kind: Literal["series"]
    name: SeriesName
    offset: int = Field(default=0, ge=0, le=MAX_OFFSET)


class ValueOperand(Wire):
    kind: Literal["value"]
    value: float


type Operand = Annotated[SeriesOperand | ValueOperand, Field(discriminator="kind")]
CompareOp = Literal["gt", "gte", "lt", "lte", "eq", "neq", "crossesAbove", "crossesBelow"]


class Compare(Wire):
    kind: Literal["compare"]
    left: Operand
    op: CompareOp
    right: Operand


class AllOf(Wire):
    kind: Literal["all"]
    of: list["Condition"] = Field(min_length=1, max_length=MAX_NODES)


class AnyOf(Wire):
    kind: Literal["any"]
    of: list["Condition"] = Field(min_length=1, max_length=MAX_NODES)


class Not(Wire):
    kind: Literal["not"]
    of: "Condition"


type Condition = Annotated[Compare | AllOf | AnyOf | Not, Field(discriminator="kind")]


class PercentLevel(Wire):
    """A distance of `percent` of the entry fill price."""

    kind: Literal["percent"]
    percent: float = Field(gt=0, le=1000)


class SeriesLevel(Wire):
    """A distance of `multiple` x the series value at the decision bar (for example an ATR series)."""

    kind: Literal["series"]
    name: SeriesName
    multiple: float = Field(gt=0, le=100)


type Level = Annotated[PercentLevel | SeriesLevel, Field(discriminator="kind")]


def _nodes(node: Condition, depth: int = 1) -> Iterator[tuple[Condition, int]]:
    yield node, depth
    if isinstance(node, AllOf | AnyOf):
        for child in node.of:
            yield from _nodes(child, depth + 1)
    elif isinstance(node, Not):
        yield from _nodes(node.of, depth + 1)


class Strategy(Wire):
    side: Literal["long", "short"] = "long"
    entry: Condition
    exit: Condition | None = None
    stop_loss: Level | None = None
    take_profit: Level | None = None

    @model_validator(mode="after")
    def _bounded(self) -> Self:
        nodes = [n for root in (self.entry, self.exit) if root is not None for n in _nodes(root)]
        if len(nodes) > MAX_NODES:
            raise ValueError(f"strategy has more than {MAX_NODES} nodes")
        if max(depth for _, depth in nodes) > MAX_DEPTH:
            raise ValueError(f"condition tree is deeper than {MAX_DEPTH}")
        return self

    def series_names(self) -> set[str]:
        names = {lvl.name for lvl in (self.stop_loss, self.take_profit) if isinstance(lvl, SeriesLevel)}
        for root in (self.entry, self.exit):
            if root is None:
                continue
            for node, _ in _nodes(root):
                if isinstance(node, Compare):
                    names |= {o.name for o in (node.left, node.right) if isinstance(o, SeriesOperand)}
        return names


class Costs(Wire):
    """Charged on every fill, entry and exit, so a round trip pays each twice."""

    commission_pct: float = Field(default=0, ge=0, le=5)
    slippage_pct: float = Field(default=0, ge=0, le=5)


class BacktestRequest(Wire):
    bars: list[Bar] = Field(min_length=2, max_length=MAX_BARS)
    series: dict[SeriesName, list[float | None]] = Field(default_factory=dict, max_length=MAX_SERIES)
    strategy: Strategy
    costs: Costs = Costs()
    initial_capital: float = Field(default=100_000, gt=0, le=1e12)
    position_fraction: float = Field(default=1.0, gt=0, le=1)
    out_of_sample_fraction: float | None = Field(default=None, ge=0.1, le=0.5)

    @model_validator(mode="after")
    def _aligned(self) -> Self:
        times = [b.time for b in self.bars]
        if any(b <= a for a, b in pairwise(times)):
            raise ValueError("bar times must be strictly increasing")
        for name, values in self.series.items():
            if name in BAR_FIELDS:
                raise ValueError(f"series '{name}' is a bar field")
            if len(values) != len(self.bars):
                raise ValueError(f"series '{name}' has {len(values)} values for {len(self.bars)} bars")
        known = BAR_FIELDS | self.series.keys()
        missing = sorted(self.strategy.series_names() - known)
        if missing:
            raise ValueError(f"unknown series '{missing[0]}'")
        return self


ExitReason = Literal["stopLoss", "takeProfit", "exitSignal", "endOfData"]


class Trade(Wire):
    side: Literal["long", "short"]
    entry_time: int
    entry_price: float
    exit_time: int
    exit_price: float
    quantity: float
    pnl: float = Field(description="Net of commission and slippage, in account currency.")
    return_pct: float = Field(description="pnl / (quantity x entry price + entry commission) x 100.")
    bars_held: int = Field(description="Exit bar index minus entry bar index.")
    exit_reason: ExitReason


class EquityPoint(Wire):
    time: int
    equity: float = Field(description="Marked at the bar's close.")


class Metrics(Wire):
    total_return_pct: float
    cagr_pct: float | None
    max_drawdown_pct: float
    sharpe: float | None = Field(description="Annualised from per-bar returns, risk-free rate 0.")
    win_rate_pct: float | None
    profit_factor: float | None = Field(description="Null when there is no losing trade.")
    exposure_pct: float
    trade_count: int
    final_equity: float


class Segment(Wire):
    start_time: int
    end_time: int
    metrics: Metrics


class SignalCounts(Wire):
    entries: int
    exits: int


class BacktestResponse(Wire):
    trades: list[Trade]
    equity: list[EquityPoint]
    metrics: Metrics
    signals: SignalCounts
    in_sample: Segment | None = None
    out_of_sample: Segment | None = None
