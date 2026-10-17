"""Start InviteDesk:  uv run app.py   (or: python app.py)  →  http://localhost:8000

Options:
  --port 8000            port to serve on (or env PORT)
  --import PATH.zip      import an event zip/folder before starting (e.g. your own planning folder)
  --run EVENT_ID         run the full agent pipeline for an event from the command line and exit
  --no-demo              do not auto-load the demo snapshot into an empty workspace
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from invitedesk import config, coordinator, db, snapshot  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="InviteDesk — multi-agent guest & speaker outreach desk")
    ap.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")), help="web port (default 8000)")
    ap.add_argument("--host", default="127.0.0.1", help="bind address (default 127.0.0.1)")
    ap.add_argument("--import", dest="import_path", help="import an event .zip or folder before starting")
    ap.add_argument("--name", default=None, help="event name for --import")
    ap.add_argument("--org", default="", help="organiser name for --import")
    ap.add_argument("--run", type=int, default=None, help="run the full agent pipeline for EVENT_ID and exit")
    ap.add_argument("--top-n", type=int, default=None, help="people to route + draft in --run (default 12)")
    ap.add_argument("--budget", type=float, default=None, help="USD cap for --run (default 0.50)")
    ap.add_argument("--no-demo", action="store_true", help="don't auto-load the demo snapshot into an empty workspace")
    args = ap.parse_args()

    db.conn()
    if args.import_path:
        eid = coordinator.import_event(Path(args.import_path).expanduser(), name=args.name, org=args.org)
        print(f"Imported event #{eid} from {args.import_path}")
    if args.run is not None:
        rid = asyncio.run(coordinator.run_pipeline(args.run, budget_usd=args.budget, top_n=args.top_n))
        run = db.one("SELECT status, usage, note FROM runs WHERE id=?", (rid,))
        print(f"Run #{rid}: {run['status']} {run['note'] or ''}")
        print(run["usage"]["totals"] if run.get("usage") else "")
        return
    if not args.no_demo and not db.q("SELECT id FROM events LIMIT 1") and snapshot.SNAPSHOT.exists() \
            and not (config.WORKSPACE / ".demo_dismissed").exists():
        print("Empty workspace: loading the demo snapshot (fictional sample events)…", flush=True)
        snapshot.load()

    import socket
    with socket.socket() as probe:
        if probe.connect_ex((args.host if args.host != "0.0.0.0" else "127.0.0.1", args.port)) == 0:
            print(f"\n  Port {args.port} is already in use (another app?). Start on another port, e.g.:\n"
                  f"    uv run app.py --port {args.port + 1}\n", flush=True)
            sys.exit(1)
    key = "found" if (config.PORTKEY_API_KEY or config.OPENAI_API_KEY) else "MISSING (browsing works; agents need it)"
    print(f"\n  InviteDesk → http://localhost:{args.port}\n  model: {config.MODEL_NAME} · API key: {key}\n", flush=True)
    import uvicorn

    uvicorn.run("invitedesk.server:app", host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
