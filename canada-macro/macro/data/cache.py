"""Timestamped raw-JSON cache under ./data/raw.

Every download is written as ``<dir>/<name>__<UTC timestamp>.json``. A new file
is written only when the payload differs from the newest cached copy, so running
``--refresh`` twice in a row leaves the cache unchanged (idempotent).
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def _digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()


def latest(directory: Path, name: str):
    """Return the newest cached file for ``name`` or None."""
    files = sorted(Path(directory).glob(f"{name}__*.json"))
    return files[-1] if files else None


def load_latest(directory: Path, name: str):
    f = latest(directory, name)
    return None if f is None else json.loads(f.read_text())


def save(directory: Path, name: str, payload) -> Path:
    """Save ``payload`` unless it is identical to the newest copy. Returns the path used."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    prev = latest(directory, name)
    if prev is not None and _digest(json.loads(prev.read_text())) == _digest(payload):
        return prev
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = directory / f"{name}__{stamp}.json"
    path.write_text(json.dumps(payload))
    return path


def get_or_fetch(directory: Path, name: str, fetch, refresh: bool):
    """Use the cached payload unless ``refresh`` is set or nothing is cached."""
    if not refresh:
        cached = load_latest(directory, name)
        if cached is not None:
            return cached
    payload = fetch()
    save(directory, name, payload)
    return payload
