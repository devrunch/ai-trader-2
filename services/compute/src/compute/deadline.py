from dataclasses import dataclass
from time import monotonic


class DeadlineExceeded(Exception):  # noqa: N818 - reads as the event it reports
    pass


@dataclass(frozen=True)
class Deadline:
    """A wall-clock budget checked cooperatively, so abandoned work stops instead of running on in its thread."""

    at: float

    @classmethod
    def after(cls, seconds: float) -> "Deadline":
        return cls(monotonic() + seconds)

    def check(self) -> None:
        if monotonic() >= self.at:
            raise DeadlineExceeded
