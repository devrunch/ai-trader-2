from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from compute.app import create_app
from compute.limits import Limits


class Echo(BaseModel):
    n: int


def make_client(limits: Limits | None = None) -> TestClient:
    app = create_app(limits or Limits())

    @app.post("/test/echo")
    def echo(body: Echo) -> Echo:
        return body

    @app.get("/test/boom")
    def boom() -> None:
        raise RuntimeError("secret detail")

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with make_client() as c:
        yield c
