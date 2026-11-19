"""Chow-Lin (1971) temporal disaggregation of an annual series to monthly.

Model:  y_m = X_m b + u_m,   u_m = rho * u_{m-1} + e_m   (monthly, unobserved)
        y_a = C y_m                                       (annual, observed)

C averages the 12 months of each year (GDP is published at annual rates, so
the annual figure is the mean of monthly annual-rate levels). rho is chosen by
maximum likelihood on a grid; b by GLS. The monthly estimate is
    y_m_hat = X b + V C' (C V C')^{-1} (y_a - C X b)
which satisfies the annual constraint exactly for benchmarked years and
extrapolates the AR(1) residual past the last annual observation.
"""
import numpy as np
import pandas as pd
from scipy.linalg import toeplitz


def aggregation_matrix(n_years: int, n_months: int) -> np.ndarray:
    C = np.zeros((n_years, n_months))
    for i in range(n_years):
        C[i, 12 * i:12 * i + 12] = 1.0 / 12.0
    return C


def chow_lin_arrays(y_a: np.ndarray, X: np.ndarray, rho_grid=None):
    """Core computation on arrays. X rows = months, first 12*len(y_a) months benchmarked."""
    n, T = len(y_a), X.shape[0]
    if T < 12 * n:
        raise ValueError("indicators must cover every benchmark year")
    C = aggregation_matrix(n, T)
    Xa = C @ X
    rho_grid = np.linspace(0.0, 0.99, 100) if rho_grid is None else rho_grid
    best = None
    for rho in rho_grid:
        V = toeplitz(rho ** np.arange(T)) / (1.0 - rho ** 2)
        Va = C @ V @ C.T
        Vai = np.linalg.inv(Va)
        b = np.linalg.solve(Xa.T @ Vai @ Xa, Xa.T @ Vai @ y_a)
        u = y_a - Xa @ b
        s2 = u @ Vai @ u / n
        ll = -0.5 * n * np.log(s2) - 0.5 * np.linalg.slogdet(Va)[1]
        if best is None or ll > best[0]:
            best = (ll, rho, b, V, Vai, u)
    ll, rho, b, V, Vai, u = best
    y_m = X @ b + V @ C.T @ Vai @ u
    return y_m, {"rho": float(rho), "beta": b, "loglik": float(ll)}


def chow_lin(annual: pd.Series, indicators: pd.DataFrame):
    """Disaggregate ``annual`` (index = Jan-1 of each year) with monthly ``indicators``.

    Uses the overlap of complete benchmark years and indicator months. Returns
    (monthly Series, info dict). ``info['benchmarked_until']`` marks the last
    month tied to an annual figure; later months are extrapolations.
    """
    ind = indicators.dropna()
    first_year = max(annual.index.min().year, ind.index.min().year
                     + (0 if ind.index.min().month == 1 else 1))
    years = [y for y in annual.index.year if y >= first_year
             and pd.Timestamp(y, 12, 1) <= ind.index.max()]
    ind = ind.loc[pd.Timestamp(years[0], 1, 1):]
    y_a = annual[annual.index.year.isin(years)].values
    X = np.column_stack([np.ones(len(ind)), ind.values])
    y_m, info = chow_lin_arrays(y_a, X)
    info["benchmarked_until"] = pd.Timestamp(years[-1], 12, 1)
    info["indicators"] = list(ind.columns)
    return pd.Series(y_m, index=ind.index, name="gdp_bc"), info


def backtest_annual(annual: pd.Series, indicators: pd.DataFrame, first_year: int = 2010) -> pd.DataFrame:
    """Out-of-sample check against *published* BC GDP.

    For each year Y: benchmark Chow-Lin on annual data up to Y-1, extrapolate
    the 12 months of Y from the indicators, and compare the implied annual
    growth with the published annual growth. A naive benchmark repeats the
    previous year's growth.
    """
    rows = []
    for Y in range(first_year, annual.index.max().year + 1):
        a = annual[annual.index.year < Y]
        ind = indicators[indicators.index < pd.Timestamp(Y + 1, 1, 1)]
        m, _ = chow_lin(a, ind)
        est = m[m.index.year == Y]
        if len(est) < 12:
            continue
        prev = annual[annual.index.year == Y - 1].iloc[0]
        g_est = 100 * (est.mean() / prev - 1)
        g_act = 100 * (annual[annual.index.year == Y].iloc[0] / prev - 1)
        g_naive = 100 * (prev / annual[annual.index.year == Y - 2].iloc[0] - 1)
        rows.append({"year": Y, "published growth %": g_act,
                     "Chow-Lin extrapolation %": g_est, "naive (last year) %": g_naive})
    return pd.DataFrame(rows).set_index("year")
