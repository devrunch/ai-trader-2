"""AWS Lambda entry point: the same FastAPI app behind a Function URL (owner decision 2026-11-11: compute on Lambda)."""

from mangum import Mangum

from compute.app import create_app
from compute.observability import configure_logging

configure_logging()
handler = Mangum(create_app(), lifespan="off")
