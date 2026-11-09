from fastapi import FastAPI

from compute import health
from compute.errors import install_error_handlers
from compute.limits import Limits
from compute.middleware import RequestContextMiddleware


def create_app(limits: Limits | None = None) -> FastAPI:
    """The stateless compute service: no database, no outbound calls, no credentials (SRD 10.2)."""
    limits = limits or Limits()
    app = FastAPI(title="AI Trader compute", version="1.0.0", docs_url=None, redoc_url=None)
    app.state.limits = limits
    install_error_handlers(app)
    app.add_middleware(RequestContextMiddleware, max_body_bytes=limits.max_body_bytes)
    app.include_router(health.router)
    return app
