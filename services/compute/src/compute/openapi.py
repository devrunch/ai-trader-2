"""Writes the service's OpenAPI document, the source of @aitrader/compute-client (SRD 10.2)."""

import json
import sys
from pathlib import Path

from compute.app import create_app


def openapi_json() -> str:
    return json.dumps(create_app().openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python -m compute.openapi <output.json>")
    Path(sys.argv[1]).write_text(openapi_json(), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
