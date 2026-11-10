import argparse

import uvicorn

from compute.app import create_app
from compute.observability import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the compute service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()
    configure_logging(args.log_level)
    uvicorn.run(create_app(), host=args.host, port=args.port, log_config=None, access_log=False)


if __name__ == "__main__":
    main()
