"""Game-style 'health' stats for the BC economy.

Each stat is the percentile rank (0-100) of the latest reading within its own
monthly history since 2001, oriented so that 100 = best month on record.
Overall HP is the simple average. This is a descriptive dashboard, not a
welfare measure: "best" is a judgement encoded in the direction column below.
"""
import numpy as np
import pandas as pd

START = "2001-01-01"   # common history (earnings data start in 2001)


def _stats(lv: pd.DataFrame) -> dict:
    """Indicator series and direction (+1 higher is better, -1 lower is better)."""
    cpi_yoy = 100 * np.log(lv["cpi_bc"]).diff(12)
    return {
        "Jobs":       ("BC employment growth, % y/y", 100 * np.log(lv["emp_bc"]).diff(12), +1),
        "Slack":      ("BC unemployment rate, %", lv["urate_bc"], -1),
        "Output":     ("BC real GDP growth (Chow-Lin), % y/y", 100 * np.log(lv["gdp_bc"]).diff(12), +1),
        "Prices":     ("Distance of BC CPI inflation from 2%, pp", (cpi_yoy - 2).abs(), -1),
        "Wages":      ("BC real weekly earnings growth, % y/y",
                       100 * np.log(lv["awe_bc"]).diff(12) - cpi_yoy, +1),
        "Housing":    ("Vancouver new-home price / BC weekly wage (affordability)",
                       lv["nhpi_van"] / lv["awe_bc"], -1),
        "Population": ("BC population growth, % y/y", lv["pop_growth_yoy_bc"], +1),
    }


def tier(score: float) -> str:
    return "STRONG" if score >= 70 else "OK" if score >= 40 else "WEAK" if score >= 20 else "CRITICAL"


def score_series(x: pd.Series, direction: int, start: str = START):
    """Percentile of the latest value in the history; returns (score, value, date)."""
    h = x.loc[start:].dropna()
    last = h.iloc[-1]
    pct = 100 * ((h < last).sum() + 0.5 * (h == last).sum()) / len(h)
    return (pct if direction > 0 else 100 - pct), float(last), h.index[-1]


def compute(levels: pd.DataFrame, start: str = START) -> dict:
    rows = []
    for name, (desc, series, direction) in _stats(levels).items():
        s, v, d = score_series(series, direction, start)
        rows.append({"stat": name, "score": round(float(s), 1), "tier": tier(s), "indicator": desc,
                     "latest": v, "as_of": f"{d:%Y-%m}",
                     "better": "higher" if direction > 0 else "lower"})
    table = pd.DataFrame(rows)
    hp = float(table["score"].mean())
    return {"table": table, "hp": hp, "tier": tier(hp), "start": start}
