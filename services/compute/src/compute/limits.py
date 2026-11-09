from dataclasses import dataclass


@dataclass(frozen=True)
class Limits:
    """Per-request bounds that keep every request's work finite."""

    max_body_bytes: int = 16 * 1024 * 1024
    request_timeout_s: float = 10.0
