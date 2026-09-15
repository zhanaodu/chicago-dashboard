#!/usr/bin/env python3
"""Serialize scheduled and button-triggered publishing on this machine."""
import fcntl
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    logs = ROOT / "logs"
    logs.mkdir(exist_ok=True)
    git = os.environ.get("GIT_BIN", "/usr/bin/git")
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")

    def run(*args, check=True):
        return subprocess.run(args, cwd=ROOT, env=env, timeout=180, check=check)

    # The OS releases this lock even when a sync is interrupted or crashes.
    with (logs / "publish.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another sync is running; please retry after it completes")
        run(git, "pull", "--ff-only", "origin", "main")
        run(sys.executable, str(ROOT / "scripts/sync_feishu_sheet.py"))
        changed = run(git, "diff", "--quiet", "HEAD", "--", "assets/data.json", check=False)
        if changed.returncode == 1:
            run(git, "add", "--", "assets/data.json")
            run(git, "commit", "--only", "-m", f"Update dashboard data {datetime.now():%Y-%m-%d}", "--", "assets/data.json")
        elif changed.returncode:
            raise RuntimeError("Unable to check data changes")
        # Retry an earlier failed push even if the data has not changed.
        run(git, "push", "origin", "main")


if __name__ == "__main__":
    main()
