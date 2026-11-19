"""Thin clients for the StatCan Web Data Service and the Bank of Canada Valet API.

Neither needs an API key. All raw responses go through ``cache`` so they are
stored as timestamped JSON in ./data/raw.
"""
import time

import pandas as pd
import requests

from . import cache
from .registry import Series

WDS = "https://www150.statcan.gc.ca/t1/wds/rest/"
VALET = "https://www.bankofcanada.ca/valet/"
START = "1990-01-01"   # earliest reference period we request


class VerificationError(RuntimeError):
    """Raised when a StatCan coordinate no longer maps to the expected series."""


def _request(method: str, url: str, **kw):
    """HTTP with a few retries and backoff (StatCan occasionally returns 5xx)."""
    for attempt in range(4):
        try:
            r = requests.request(method, url, timeout=120, **kw)
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


# ----------------------------------------------------------------------------- StatCan
def fetch_series_info(series: list[Series]):
    body = [{"productId": s.pid, "coordinate": s.coordinate} for s in series]
    return _request("POST", WDS + "getSeriesInfoFromCubePidCoord", json=body)


def fetch_code_sets():
    return _request("GET", WDS + "getCodeSets")


def fetch_vector_range(vector_id: int, start: str = START, end: str = "2100-01-01"):
    url = (f"{WDS}getDataFromVectorByReferencePeriodRange?vectorIds=%22{vector_id}%22"
           f"&startRefPeriod={start}&endReferencePeriod={end}")
    return _request("GET", url)


def verify(series: list[Series], info: list, code_sets: dict) -> pd.DataFrame:
    """Check each resolved vector against the registry and return a metadata table.

    Raises VerificationError listing every mismatch; the caller must stop rather
    than silently substitute a different series.
    """
    uom = {u["memberUomCode"]: u["memberUomEn"] for u in code_sets["object"]["uom"]}
    scal = {s["scalarFactorCode"]: s["scalarFactorDescEn"] for s in code_sets["object"]["scalar"]}
    # WDS does not preserve request order, so match on (productId, coordinate).
    by_coord = {}
    for item in info:
        o = item.get("object") or {}
        by_coord[(o.get("productId"), o.get("coordinate"))] = item
    rows, problems = [], []
    for s in series:
        item = by_coord.get((s.pid, s.coordinate), {"status": "MISSING"})
        o = item.get("object") or {}
        vec = o.get("vectorId")
        title = o.get("SeriesTitleEn") or ""
        if item.get("status") != "SUCCESS" or vec != s.expected_vector:
            problems.append(f"{s.key}: PID {s.pid} coord {s.coordinate} -> v{vec} "
                            f"(expected v{s.expected_vector})")
        elif s.geo and s.geo not in title:
            problems.append(f"{s.key}: title '{title}' lacks geography '{s.geo}'")
        rows.append({
            "key": s.key, "source": "StatCan", "table": _fmt_pid(s.pid), "vector": f"v{vec}",
            "title": title, "geography": title.split(";")[0],
            "units": f"{uom.get(o.get('memberUomCode'), '?')} ({scal.get(o.get('scalarFactorCode'), '?')})",
            "description": s.description,
        })
    if problems:
        raise VerificationError("Unverified StatCan series:\n  " + "\n  ".join(problems))
    return pd.DataFrame(rows)


def _fmt_pid(pid: int) -> str:
    p = str(pid)
    return f"{p[:2]}-{p[2:4]}-{p[4:8]}"


def parse_statcan(payload) -> pd.Series:
    """Turn a getDataFromVector* response into a float Series indexed by period start."""
    pts = payload[0]["object"]["vectorDataPoint"]
    idx = pd.to_datetime([p["refPer"] for p in pts])
    vals = [p["value"] for p in pts]       # None for suppressed points
    return pd.Series(vals, index=idx, dtype=float).sort_index()


# ----------------------------------------------------------------------------- Bank of Canada
def fetch_boc(name: str, start: str = START):
    return _request("GET", f"{VALET}observations/{name}/json?start_date={start}")


def parse_boc(payload, name: str) -> pd.Series:
    obs = payload["observations"]
    idx = pd.to_datetime([o["d"] for o in obs])
    vals = [float(o[name]["v"]) if name in o and o[name].get("v") not in (None, "") else None
            for o in obs]
    return pd.Series(vals, index=idx, dtype=float).sort_index()


def boc_meta(payload, s: Series) -> dict:
    d = payload["seriesDetail"][s.boc_name]
    return {"key": s.key, "source": "Bank of Canada", "table": "Valet", "vector": s.boc_name,
            "title": d.get("label", ""), "geography": "Canada",
            "units": (d.get("metadata") or {}).get("unit", "Percent") if isinstance(d.get("metadata"), dict) else "",
            "description": s.description}


# ----------------------------------------------------------------------------- orchestration
def load_all(series: list[Series], raw_dir, refresh: bool, log=print):
    """Download (or read from cache) every series. Returns (dict of raw Series, metadata df)."""
    sc = [s for s in series if s.source == "statcan"]
    info = cache.get_or_fetch(raw_dir / "statcan_meta", "series_info",
                              lambda: fetch_series_info(sc), refresh)
    codes = cache.get_or_fetch(raw_dir / "statcan_meta", "code_sets", fetch_code_sets, refresh)
    meta = verify(sc, info, codes)
    for r in meta.itertuples():
        log(f"  verified {r.vector:>12}  {r.table}  {r.title}  [{r.units}]")

    raw, boc_rows = {}, []
    for s in series:
        if s.source == "statcan":
            p = cache.get_or_fetch(raw_dir / "statcan", s.key,
                                   lambda s=s: fetch_vector_range(s.expected_vector), refresh)
            raw[s.key] = parse_statcan(p)
        else:
            p = cache.get_or_fetch(raw_dir / "boc", s.key, lambda s=s: fetch_boc(s.boc_name), refresh)
            x = parse_boc(p, s.boc_name)
            raw[s.key] = 1.0 / x if s.invert else x
            row = boc_meta(p, s)
            boc_rows.append(row)
            log(f"  verified {s.boc_name:>18}  BoC Valet  {row['title']}  [{row['units']}]")
    meta = pd.concat([meta, pd.DataFrame(boc_rows)], ignore_index=True)
    return raw, meta
