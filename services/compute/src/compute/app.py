from typing import Any

from fastapi import FastAPI

from compute import health
from compute.backtest.router import router as backtest_router
from compute.errors import install_error_handlers
from compute.limits import Limits
from compute.middleware import RequestContextMiddleware


def _drop_property_titles(node: object) -> None:
    """Pydantic titles every property after its name; they add nothing to the generated client."""
    if isinstance(node, dict):
        for prop in (node.get("properties") or {}).values():
            if isinstance(prop, dict):
                prop.pop("title", None)
        for child in node.values():
            _drop_property_titles(child)
    elif isinstance(node, list):
        for child in node:
            _drop_property_titles(child)


class ComputeApp(FastAPI):
    def openapi(self) -> dict[str, Any]:
        if self.openapi_schema is None:
            _drop_property_titles(super().openapi())
        return super().openapi()


def create_app(limits: Limits | None = None) -> FastAPI:
    """The stateless compute service: no database, no outbound calls, no credentials (SRD 10.2)."""
    limits = limits or Limits()
    app = ComputeApp(
        title="AI Trader compute",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        separate_input_output_schemas=False,
    )
    app.state.limits = limits
    install_error_handlers(app)
    app.add_middleware(RequestContextMiddleware, max_body_bytes=limits.max_body_bytes)
    app.include_router(health.router)
    app.include_router(backtest_router)
    return app
