"""Tiny .env.local reader so the scripts need no extra packages."""
import os
from pathlib import Path


def load_env() -> None:
    root = Path(__file__).resolve().parent.parent
    for name in (".env.local", ".env"):
        path = root / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), value)


def need(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing {name}. Add it to .env.local (see .env.example).")
    return value
