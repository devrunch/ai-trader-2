import json
import logging
import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from compute.limits import Limits
from compute.observability import JsonFormatter
from tests.conftest import make_client


def test_health_returns_ok(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_echoes_the_callers_request_id(client: TestClient) -> None:
    res = client.get("/health", headers={"x-request-id": "req-123"})
    assert res.headers["x-request-id"] == "req-123"


def test_generates_a_request_id_when_absent(client: TestClient) -> None:
    res = client.get("/health")
    assert re.fullmatch(r"[0-9a-f]{32}", res.headers["x-request-id"])


def test_replaces_an_unsafe_request_id(client: TestClient) -> None:
    res = client.get("/health", headers={"x-request-id": "bad id\nwith newline"})
    assert re.fullmatch(r"[0-9a-f]{32}", res.headers["x-request-id"])


def test_rejects_a_body_over_the_limit_with_413() -> None:
    with make_client(Limits(max_body_bytes=64)) as c:
        res = c.post(
            "/test/echo",
            content=b'{"n": 1, "pad": "' + b"x" * 100 + b'"}',
            headers={"content-type": "application/json", "x-request-id": "r1"},
        )
    assert res.status_code == 413
    assert res.json() == {"code": "VALIDATION_FAILED", "message": "Request body exceeds 64 bytes", "requestId": "r1"}


def test_rejects_a_streamed_body_over_the_limit_with_413() -> None:
    def chunks() -> Iterator[bytes]:  # no content-length header
        yield b'{"n": 1, "pad": "'
        yield b"x" * 100
        yield b'"}'

    with make_client(Limits(max_body_bytes=64)) as c:
        res = c.post("/test/echo", content=chunks(), headers={"content-type": "application/json"})
    assert res.status_code == 413
    assert res.json()["code"] == "VALIDATION_FAILED"


def test_accepts_a_body_within_the_limit(client: TestClient) -> None:
    res = client.post("/test/echo", json={"n": 7})
    assert res.status_code == 200
    assert res.json() == {"n": 7}


def test_maps_validation_errors_to_the_error_body(client: TestClient) -> None:
    res = client.post("/test/echo", json={"n": "x"}, headers={"x-request-id": "r2"})
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert body["requestId"] == "r2"
    assert body["details"][0]["loc"] == ["body", "n"]
    assert "input" not in body["details"][0]


def test_maps_unknown_routes_to_not_found(client: TestClient) -> None:
    res = client.get("/nope", headers={"x-request-id": "r3"})
    assert res.status_code == 404
    assert res.json() == {"code": "NOT_FOUND", "message": "Not Found", "requestId": "r3"}


def test_hides_internal_errors(client: TestClient) -> None:
    res = client.get("/test/boom", headers={"x-request-id": "r4"})
    assert res.status_code == 500
    assert res.json() == {"code": "INTERNAL", "message": "Internal error", "requestId": "r4"}


def test_logs_one_json_line_per_request(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="compute.access")
    client.post("/test/echo", json={"n": 1}, headers={"x-request-id": "r5"})
    records = [r for r in caplog.records if r.name == "compute.access"]
    assert len(records) == 1
    line = json.loads(JsonFormatter().format(records[0]))
    assert line["msg"] == "request"
    assert line["level"] == "info"
    assert line["requestId"] == "r5"
    assert line["method"] == "POST"
    assert line["path"] == "/test/echo"
    assert line["status"] == 200
    assert isinstance(line["durationMs"], float)
    assert "body" not in line
