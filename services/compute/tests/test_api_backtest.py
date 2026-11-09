"""POST /compute/v1/backtest: request validation and the HTTP contract."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from compute.limits import Limits
from tests.conftest import make_client
from tests.fixtures import TEN_BARS, TEN_SIG, TEN_XSIG, bars, request

URL = "/compute/v1/backtest"


def ok_request() -> dict[str, Any]:
    return request(TEN_BARS, TEN_SIG, TEN_XSIG, stopLoss={"kind": "percent", "percent": 5})


def test_runs_a_backtest_with_camel_case_fields(client: TestClient) -> None:
    res = client.post(URL, json=ok_request())
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"trades", "equity", "metrics", "signals", "inSample", "outOfSample"}
    assert body["inSample"] is None
    assert set(body["trades"][0]) == {
        "side",
        "entryTime",
        "entryPrice",
        "exitTime",
        "exitPrice",
        "quantity",
        "pnl",
        "returnPct",
        "barsHeld",
        "exitReason",
    }
    assert set(body["metrics"]) == {
        "totalReturnPct",
        "cagrPct",
        "maxDrawdownPct",
        "sharpe",
        "winRatePct",
        "profitFactor",
        "exposurePct",
        "tradeCount",
        "finalEquity",
    }
    assert len(body["equity"]) == 10


def test_accepts_bars_with_null_volume_and_a_repaired_flag(client: TestClient) -> None:
    raw = ok_request()
    raw["bars"] = [{**b, "volume": None, "repaired": True} for b in raw["bars"]]
    assert client.post(URL, json=raw).status_code == 200


def errors_for(client: TestClient, raw: dict[str, Any]) -> list[str]:
    res = client.post(URL, json=raw)
    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_FAILED"
    return [d["msg"] for d in res.json()["details"]]


def test_rejects_bar_times_that_do_not_increase(client: TestClient) -> None:
    raw = ok_request()
    raw["bars"][3]["time"] = raw["bars"][2]["time"]
    assert any("strictly increasing" in m for m in errors_for(client, raw))


def test_rejects_inconsistent_ohlc(client: TestClient) -> None:
    raw = ok_request()
    raw["bars"][0]["high"] = 98
    assert any("high must be" in m for m in errors_for(client, raw))


def test_rejects_series_of_the_wrong_length(client: TestClient) -> None:
    raw = ok_request()
    raw["series"]["sig"] = [1, 0]
    assert any("'sig' has 2 values for 10 bars" in m for m in errors_for(client, raw))


def test_rejects_a_reference_to_a_missing_series(client: TestClient) -> None:
    raw = ok_request()
    raw["strategy"]["stopLoss"] = {"kind": "series", "name": "atr14", "multiple": 2}
    assert any("unknown series 'atr14'" in m for m in errors_for(client, raw))


def test_rejects_a_series_named_like_a_bar_field(client: TestClient) -> None:
    raw = ok_request()
    raw["series"]["close"] = [1.0] * 10
    assert any("'close' is a bar field" in m for m in errors_for(client, raw))


@pytest.mark.parametrize("bad", [float("inf"), float("nan")])
def test_rejects_non_finite_numbers(client: TestClient, bad: float) -> None:
    raw = ok_request()
    raw["bars"][0]["close"] = bad
    res = client.post(URL, content=json.dumps(raw, allow_nan=True), headers={"content-type": "application/json"})
    assert res.status_code == 422


def test_rejects_too_few_bars(client: TestClient) -> None:
    raw = request(bars([(1, 1, 1, 1)]), [0])
    errors_for(client, raw)


def test_returns_504_when_the_time_limit_passes() -> None:
    with make_client(Limits(request_timeout_s=0)) as c:
        res = c.post(URL, json=ok_request(), headers={"x-request-id": "slow"})
    assert res.status_code == 504
    assert res.json() == {"code": "UNAVAILABLE", "message": "Backtest exceeded 0 s", "requestId": "slow"}
