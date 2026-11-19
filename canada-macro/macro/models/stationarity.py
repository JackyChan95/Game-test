"""ADF + KPSS stationarity tests and the transformation decision.

Decision rule (conservative): a series is treated as stationary only if ADF
rejects a unit root (p < 0.05) AND KPSS does not reject stationarity
(p >= 0.05). Otherwise it is differenced: log-differenced (x100, % per month)
if strictly positive and not already a rate, plain-differenced otherwise.
"""
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller, kpss

RATE_LIKE = {"policy_rate", "gov5y", "prime", "mortgage5y", "urate_bc",
             "pop_growth_bc", "pop_growth_yoy_bc", "bank_rate"}


def tests(x: pd.Series) -> dict:
    x = x.dropna()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")          # KPSS warns when p is off its table
        adf_p = adfuller(x, autolag="AIC", regression="c")[1]
        kpss_p = kpss(x, regression="c", nlags="auto")[1]
    return {"adf_p": float(adf_p), "kpss_p": float(kpss_p),
            "stationary": bool(adf_p < 0.05 and kpss_p >= 0.05)}


def transform(name: str, x: pd.Series):
    """Return (transformed series, transform label, report rows)."""
    rows = []
    use_log = name not in RATE_LIKE and (x.dropna() > 0).all()
    level = np.log(x) * 100 if use_log else x
    t0 = tests(level)
    rows.append({"series": name, "form": "100*log level" if use_log else "level", **t0})
    if t0["stationary"]:
        return level, rows[-1]["form"], rows
    d = level.diff()
    t1 = tests(d)
    form = "100*dlog (% m/m)" if use_log else "first difference"
    rows.append({"series": name, "form": form, **t1})
    return d, form, rows


def stationarity_report(df: pd.DataFrame):
    """Transform every column; return (transformed df, forms dict, report df)."""
    out, forms, rows = {}, {}, []
    for c in df.columns:
        z, f, r = transform(c, df[c])
        out[c], forms[c] = z, f
        rows += r
    rep = pd.DataFrame(rows)
    rep["chosen"] = rep.apply(lambda r: forms[r["series"]] == r["form"], axis=1)
    return pd.DataFrame(out), forms, rep
