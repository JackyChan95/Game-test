"""Error-correction model for the Vancouver New Housing Price Index.

Long run (levels):
    log NHPI = a + b1 mortgage5y + b2 log AWE + b3 popgrowth_yoy + b4 log starts_12m + u
estimated by Dynamic OLS (Stock & Watson 1993: leads and lags of the regressors'
differences, HAC standard errors), which gives valid inference on the long-run
coefficients when the variables are cointegrated. The Engle-Granger test checks
cointegration on the static residuals.

Short run:
    dlog NHPI_t = c + gamma u_{t-1} + sum phi_i dlog NHPI_{t-i} + sum theta_j dX_{t-1} + e
gamma < 0 is the speed of adjustment back to the long-run relation.

Interpretation of b:
- log regressors (wages, starts): elasticities (% change in NHPI per 1% change).
- level regressors (mortgage rate, population growth): semi-elasticities
  (% change in NHPI per 1 percentage point).
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.stattools import coint

LR_VARS = {
    "mortgage5y": ("5-yr mortgage rate", "semi-elasticity, % per 1pp", False),
    "awe_bc": ("BC avg weekly earnings", "elasticity", True),
    "pop_growth_yoy_bc": ("BC population growth (y/y)", "semi-elasticity, % per 1pp", False),
    "starts_van_12m": ("Vancouver housing starts (12-m sum)", "elasticity", True),
}


def prepare(levels: pd.DataFrame) -> pd.DataFrame:
    d = pd.DataFrame({"y": np.log(levels["nhpi_van"])})
    for k, (_, _, is_log) in LR_VARS.items():
        d[k] = np.log(levels[k]) if is_log else levels[k]
    return d.dropna()


def dols(d: pd.DataFrame, leads_lags: int = 2, hac_lags: int = 12):
    X = d[list(LR_VARS)]
    dX = X.diff()
    parts = [sm.add_constant(X)]
    for j in range(-leads_lags, leads_lags + 1):
        parts.append(dX.shift(-j).add_suffix(f"_d{j:+d}"))
    Z = pd.concat(parts, axis=1).dropna()
    y = d["y"].loc[Z.index]
    res = sm.OLS(y, Z).fit(cov_type="HAC", cov_kwds={"maxlags": hac_lags})
    return res


def long_run_table(res, label: str) -> pd.DataFrame:
    rows = []
    for k, (name, kind, _) in LR_VARS.items():
        b, se = res.params[k], res.bse[k]
        scale = 1.0 if kind == "elasticity" else 100.0   # semi-elasticity in % per pp
        rows.append({"sample": label, "variable": name, "type": kind,
                     "estimate": b * scale, "se": se * scale,
                     "ci_low": (b - 1.96 * se) * scale, "ci_high": (b + 1.96 * se) * scale})
    return pd.DataFrame(rows)


def ecm(d: pd.DataFrame, lr_res, ar_lags: int = 2):
    X = d[list(LR_VARS)]
    u = d["y"] - sm.add_constant(X) @ lr_res.params[["const"] + list(LR_VARS)]
    dy = d["y"].diff() * 100
    Z = pd.DataFrame({"ect_lag": u.shift(1) * 100})
    for i in range(1, ar_lags + 1):
        Z[f"dy_lag{i}"] = dy.shift(i)
    for k in LR_VARS:
        Z[f"d_{k}_lag1"] = (X[k].diff() * (100 if LR_VARS[k][2] else 1)).shift(1)
    Z = sm.add_constant(Z).dropna()
    res = sm.OLS(dy.loc[Z.index], Z).fit(cov_type="HAC", cov_kwds={"maxlags": 6})
    gamma = res.params["ect_lag"]
    half_life = np.log(0.5) / np.log(1 + gamma) if -1 < gamma < 0 else np.nan
    return res, u, float(gamma), float(half_life)


def run(levels: pd.DataFrame, break_date: str = "2020-01-01") -> dict:
    d = prepare(levels)
    eg_stat, eg_p, _ = coint(d["y"], d[list(LR_VARS)], trend="c")
    full = dols(d)
    pre = dols(d[d.index < break_date])
    ecm_res, resid, gamma, hl = ecm(d, full)
    table = pd.concat([long_run_table(full, f"{d.index.min():%Y-%m} to {d.index.max():%Y-%m}"),
                       long_run_table(pre, f"{d.index.min():%Y-%m} to 2019-12 (pre-break)")])
    fitted = sm.add_constant(d[list(LR_VARS)]) @ full.params[["const"] + list(LR_VARS)]
    return {"table": table, "eg_stat": float(eg_stat), "eg_p": float(eg_p),
            "gamma": gamma, "gamma_se": float(ecm_res.bse["ect_lag"]), "half_life": hl,
            "ecm_r2": float(ecm_res.rsquared), "n": int(full.nobs),
            "actual": d["y"], "fitted": fitted, "dols_r2": float(full.rsquared)}
