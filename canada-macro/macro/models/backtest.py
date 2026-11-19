"""Expanding-window out-of-sample evaluation of the BVAR vs random walk and AR(1).

At each forecast origin the BVAR's lag order (BIC) and posterior are re-estimated
on data up to the origin, then point forecasts (posterior mean) are made for
h = 1..H. Forecasts are compared in *levels* (log levels x100 for log series,
so errors read as %; percentage points for rates).

Baselines
- Random walk: level stays at its last value (no drift).
- AR(1): AR(1) with intercept on the model's transformed series, cumulated back.

Directional hit rate: share of origins where the sign of (forecast - last value)
matches the sign of (actual - last value). Undefined for the random walk.
"""
import numpy as np
import pandas as pd
from scipy import stats

from .bvar import MinnesotaBVAR, select_lags_bic


def rmse(e) -> float:
    e = np.asarray(e, float)
    return float(np.sqrt(np.nanmean(e ** 2)))


def hit_rate(forecast, actual, last) -> float:
    f, a, l = (np.asarray(v, float) for v in (forecast, actual, last))
    s_f, s_a = np.sign(f - l), np.sign(a - l)
    ok = (s_a != 0) & (s_f != 0)
    return float(np.mean(s_f[ok] == s_a[ok])) if ok.any() else np.nan


def diebold_mariano(e1, e2, h: int) -> float:
    """Two-sided p-value of DM test (squared loss) with Harvey et al. correction."""
    d = np.asarray(e1, float) ** 2 - np.asarray(e2, float) ** 2
    d = d[~np.isnan(d)]
    T = len(d)
    if T < 10:
        return np.nan
    dbar = d.mean()
    gamma = [np.mean((d[k:] - dbar) * (d[:T - k] - dbar)) for k in range(h)]
    var = (gamma[0] + 2 * sum(gamma[1:])) / T
    if var <= 0:
        return np.nan
    k = np.sqrt((T + 1 - 2 * h + h * (h - 1) / T) / T)
    stat = k * dbar / np.sqrt(var)
    return float(2 * stats.t.sf(abs(stat), df=T - 1))


def _to_level(path_t, last_level, differenced: bool):
    return last_level + np.cumsum(path_t) if differenced else path_t


def _ar1_forecast(z: np.ndarray, h: int):
    x, y = z[:-1], z[1:]
    b, a = np.polyfit(x, y, 1)
    out, cur = [], z[-1]
    for _ in range(h):
        cur = a + b * cur
        out.append(cur)
    return np.array(out)


def run(Z: pd.DataFrame, L: pd.DataFrame, differenced: dict, start: str = "2010-01-01",
        horizons=(1, 3, 6, 12), lam: float = 0.2, step: int = 1):
    """Z: transformed data (model input). L: matching level data (100*log or rate).

    Returns a long DataFrame of forecasts (one row per origin x variable x horizon).
    """
    H = max(horizons)
    names = list(Z.columns)
    origins = [i for i in range(len(Z)) if Z.index[i] >= pd.Timestamp(start) and i + 1 < len(Z)]
    origins = origins[::step]
    recs = []
    for i in origins:
        Zt = Z.iloc[:i + 1]
        p = select_lags_bic(Zt, maxlags=6)
        m = MinnesotaBVAR(p, lam).fit(Zt)
        fz = m.forecast_mean(H)
        for j, v in enumerate(names):
            last = L[v].iloc[i]
            bvar_lv = _to_level(fz[:, j], last, differenced[v])
            ar_lv = _to_level(_ar1_forecast(Zt[v].values, H), last, differenced[v])
            for h in horizons:
                if i + h >= len(Z):
                    continue
                recs.append({"origin": Z.index[i], "var": v, "h": h, "last": last,
                             "actual": L[v].iloc[i + h], "BVAR": bvar_lv[h - 1],
                             "AR(1)": ar_lv[h - 1], "Random walk": last})
    return pd.DataFrame(recs)


def summarize(fc: pd.DataFrame) -> pd.DataFrame:
    """RMSE, relative RMSE, Diebold-Mariano p-value and hit rates by variable and horizon."""
    rows = []
    for (v, h), g in fc.groupby(["var", "h"]):
        e = {k: g[k] - g["actual"] for k in ["BVAR", "AR(1)", "Random walk"]}
        r_rw = rmse(e["Random walk"])
        rows.append({"var": v, "h": h, "n": len(g),
                     "RMSE BVAR": rmse(e["BVAR"]), "RMSE AR(1)": rmse(e["AR(1)"]),
                     "RMSE RW": r_rw,
                     "BVAR/RW": rmse(e["BVAR"]) / r_rw if r_rw > 0 else np.nan,
                     "AR(1)/RW": rmse(e["AR(1)"]) / r_rw if r_rw > 0 else np.nan,
                     "DM p (BVAR vs RW)": diebold_mariano(e["BVAR"], e["Random walk"], h),
                     "Hit BVAR": hit_rate(g["BVAR"], g["actual"], g["last"]),
                     "Hit AR(1)": hit_rate(g["AR(1)"], g["actual"], g["last"])})
    return pd.DataFrame(rows)
