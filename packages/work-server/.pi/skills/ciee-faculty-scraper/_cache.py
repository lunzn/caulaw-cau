"""TTL-based JSON file cache for skill scrapers."""
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Optional

_BASE = Path(os.environ.get("SKILLS_CACHE_DIR", "/app/.cache/skills"))


def _path(namespace: str, key: str) -> Path:
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key[:40])
    return _BASE / namespace / f"{safe}_{h}.json"


def get(namespace: str, key: str, ttl: float) -> Optional[Any]:
    p = _path(namespace, key)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if time.time() - data["ts"] > ttl:
            return None
        return data["v"]
    except Exception:
        return None


def set(namespace: str, key: str, value: Any) -> None:  # noqa: A001
    try:
        p = _path(namespace, key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            json.dumps({"ts": time.time(), "v": value}, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        pass
