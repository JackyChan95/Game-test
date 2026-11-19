"""Mixed-frequency dynamic factor nowcast of current-quarter BC real GDP growth.

Monthly indicators (stationary transforms) load on one common factor with AR(2)
dynamics; the quarterly target (q/q growth of the Chow-Lin BC GDP series) is tied
to the monthly factor through the Mariano-Murasawa aggregation inside
statsmodels' DynamicFactorMQ. Missing values (ragged edge, retail before 2017,
permits before 2018) are handled by the Kalman filter.

IMPORTANT: the target is itself modelled. BC GDP is only published annually;
quarterly values come from the Chow-Lin disaggregation (benchmarked to annual
totals through the last published year, extrapolated after).
"""
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.dynamic_factor_mq import DynamicFactorMQ

from ..data.registry import NOWCAST_VARS

DIFF_ONLY = {"urate_bc"}   # differenced, not log-differenced


def monthly_indicators(levels: pd.DataFrame, start: str = "1997-02-01") -> pd.DataFrame:
    m = pd.DataFrame({k: (levels[k].diff() if k in DIFF_ONLY else 100 * np.log(levels[k]).diff())
                      for k in NOWCAST_VARS})
    m = m.loc[start:].dropna(how="all")
    m.index = m.index.to_period("M")
    return m


def quarterly_target(gdp_bc_monthly: pd.Series) -> pd.Series:
    """q/q % growth of the quarterly average, complete quarters only."""
    g = gdp_bc_monthly.dropna()
    qa = g.resample("QS").mean()[g.resample("QS").count() == 3]
    q = (100 * np.log(qa).diff()).dropna()
    q.index = q.index.to_period("Q")
    return q.rename("gdp_bc_q")


def fit(monthly: pd.DataFrame, target: pd.Series, maxiter: int = 200):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        mod = DynamicFactorMQ(monthly, endog_quarterly=target.to_frame(), factors=1,
                              factor_orders=2, idiosyncratic_ar1=True)
        return mod.fit(disp=False, maxiter=maxiter)


def predict_quarter(res, quarter: pd.Period, alphas=(0.32, 0.10)):
    """Nowcast for ``quarter`` (value of the target at the quarter's last month)."""
    month = quarter.asfreq("M", how="end")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        pred = res.get_prediction(start=month, end=month)
        out = {"mean": float(pred.predicted_mean["gdp_bc_q"].iloc[0])}
        for a in alphas:
            ci = pred.conf_int(alpha=a)
            cols = [c for c in ci.columns if "gdp_bc_q" in c]
            out[f"lo{int(round((1 - a) * 100))}"] = float(ci[cols[0]].iloc[0])
            out[f"hi{int(round((1 - a) * 100))}"] = float(ci[cols[1]].iloc[0])
    return out


def run(levels: pd.DataFrame, today: pd.Timestamp) -> dict:
    monthly = monthly_indicators(levels)
    target = quarterly_target(levels["gdp_bc"])
    res = fit(monthly, target)
    current_q = pd.Period(today, "Q")
    last_q = target.index.max()
    quarters = pd.period_range(last_q + 1, current_q, freq="Q")
    nowcasts = {str(q): predict_quarter(res, q) for q in quarters}
    loadings = res.params.filter(like="loading").rename(lambda s: s.split("->")[-1])
    data_through = {c: str(monthly[c].last_valid_index()) for c in monthly.columns}
    return {"nowcasts": nowcasts, "current_quarter": str(current_q), "target": target,
            "last_target_q": str(last_q), "data_through": data_through,
            "loadings": loadings, "monthly": monthly}


def backtest(levels: pd.DataFrame, first: str = "2012Q1", maxiter: int = 100) -> pd.DataFrame:
    """Expanding-window pseudo-out-of-sample nowcasts vs random walk and AR(1).

    For each quarter q: indicators are cut at q's last month, the target at q-1,
    the DFM is re-estimated, and q is nowcast. Final-vintage data are used and
    publication lags are not replicated, so this is optimistic.
    """
    monthly = monthly_indicators(levels)
    target = quarterly_target(levels["gdp_bc"])
    # Only quarters with benchmarked annual totals are scored.
    bench_end = pd.Period(levels["gdp_bc"].dropna().index.max(), "Q")
    rows = []
    for q in pd.period_range(first, min(target.index.max(), bench_end), freq="Q"):
        y_train = target[target.index < q]
        m_train = monthly[monthly.index <= q.asfreq("M", how="end")]
        # Indicators need some history in the window (retail starts 2017, permits 2018).
        m_train = m_train.loc[:, m_train.notna().sum() >= 36]
        res = fit(m_train, y_train, maxiter=maxiter)
        dfm = predict_quarter(res, q, alphas=())["mean"]
        rw = y_train.iloc[-1]
        x, y = y_train.shift(1).dropna(), y_train.iloc[1:]
        b = np.polyfit(x.values, y.values, 1)
        ar1 = b[0] * y_train.iloc[-1] + b[1]
        rows.append({"quarter": str(q), "actual": target[q], "prev": rw,
                     "DFM": dfm, "Random walk": rw, "AR(1)": ar1})
    return pd.DataFrame(rows).set_index("quarter")
