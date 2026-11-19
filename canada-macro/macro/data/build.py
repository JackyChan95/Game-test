"""Clean raw series and align everything to a monthly panel.

Rules
- Monthly series: used as published (month-start index).
- Daily Bank of Canada series: monthly mean of business days; the current,
  incomplete month is dropped.
- Quarterly population (a stock dated the first day of the quarter): log level
  interpolated to monthly with a shape-preserving PCHIP spline. Flagged.
- Annual BC real GDP: disaggregated to monthly by Chow-Lin with Canada monthly
  GDP and BC employment as indicators. Flagged as modelled.
- Seasonal adjustment: only for series StatCan does not already adjust, only if
  a monthly-dummy F-test finds seasonality (p < 0.01), using STL on logs.
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.seasonal import STL

from ..models.chowlin import chow_lin
from .registry import BY_KEY


def seasonality_pvalue(x: pd.Series) -> float:
    """F-test p-value that monthly dummies explain the monthly log change."""
    d = np.log(x.dropna()).diff().dropna()
    dummies = pd.get_dummies(d.index.month, drop_first=True, dtype=float)
    X = sm.add_constant(dummies.values)
    res = sm.OLS(d.values, X).fit()
    k = dummies.shape[1]
    R = np.hstack([np.zeros((k, 1)), np.eye(k)])
    return float(res.f_test(R).pvalue)


def seasonal_adjust(x: pd.Series, alpha: float = 0.01):
    """Return (series, adjusted?, p-value). STL is two-sided: see report caveats."""
    x = x.dropna()
    p = seasonality_pvalue(x)
    if p >= alpha:
        return x, False, p
    stl = STL(np.log(x), period=12, robust=True).fit()
    return np.exp(np.log(x) - stl.seasonal), True, p


def quarterly_to_monthly(q: pd.Series) -> pd.Series:
    """Interpolate a quarterly stock (dated at quarter start) to monthly via PCHIP on logs."""
    q = q.dropna()
    idx = pd.date_range(q.index.min(), q.index.max(), freq="MS")
    logm = np.log(q).reindex(idx).interpolate(method="pchip")
    return np.exp(logm)


def build_panel(raw: dict, today: pd.Timestamp | None = None, log=print):
    """Return (levels DataFrame, flags DataFrame, info dict)."""
    today = today or pd.Timestamp.today()
    this_month = pd.Timestamp(today.year, today.month, 1)
    cols, flags = {}, []

    for key, x in raw.items():
        s = BY_KEY[key]
        x = x.dropna()
        flag = {"key": key, "native_freq": s.freq, "interpolated": False,
                "modelled": False, "seasonal_adjustment": "", "seasonality_p": np.nan}
        if s.freq == "A":
            continue                                    # handled by Chow-Lin below
        if s.freq == "D":
            x = x.resample("MS").mean()
            x = x[x.index < this_month]
            flag["seasonal_adjustment"] = "n/a (interest/FX rate)"
        elif s.freq == "Q":
            x = quarterly_to_monthly(x)
            flag["interpolated"] = True
            flag["seasonal_adjustment"] = "n/a (stock, interpolated)"
        else:
            x = x.resample("MS").mean()
            if s.statcan_adjusted:
                flag["seasonal_adjustment"] = "StatCan SA"
            elif not s.seasonal_check:
                flag["seasonal_adjustment"] = "n/a (rate)"
            else:
                x, done, p = seasonal_adjust(x)
                flag["seasonality_p"] = p
                flag["seasonal_adjustment"] = "STL (this pipeline)" if done else "none needed (no seasonality)"
        cols[key] = x
        flags.append(flag)

    levels = pd.DataFrame(cols).sort_index()

    # --- Extend the policy rate before 2009-04 --------------------------------
    # Valet's V39079 starts in April 2009. Since Feb 1996 the Bank Rate has been
    # the top of the 50bp operating band, i.e. target + 25bp, so before 2009-04
    # we use Bank Rate - 0.25. The spread is checked on the overlap.
    overlap = (levels["bank_rate"] - levels["policy_rate"]).dropna()
    # Months with a rate decision differ (point-in-time Bank Rate vs monthly
    # mean of the daily target), so test the median and the share of exact months.
    share_exact = float(((overlap - 0.25).abs() < 0.02).mean())
    spread_ok = abs(overlap.median() - 0.25) < 0.01 and share_exact > 0.8
    log(f"  Bank Rate - target spread on overlap: median {overlap.median():.3f}, "
        f"{share_exact:.0%} of months exactly 25bp ({'OK' if spread_ok else 'CHECK SPLICE'})")
    early = (levels["bank_rate"] - 0.25)[levels.index < levels["policy_rate"].first_valid_index()]
    early = early[early.index >= "1996-03-01"]
    levels["policy_rate"] = levels["policy_rate"].combine_first(early)
    for f in flags:
        if f["key"] == "policy_rate":
            f["seasonal_adjustment"] = "n/a (rate); pre-2009-04 = Bank Rate - 0.25"

    # --- BC monthly real GDP via Chow-Lin --------------------------------------
    gdp_bc, cl = chow_lin(raw["gdp_bc_annual"].dropna(), levels[["gdp_ca", "emp_bc"]])
    levels["gdp_bc"] = gdp_bc
    flags.append({"key": "gdp_bc", "native_freq": "A", "interpolated": True, "modelled": True,
                  "seasonal_adjustment": "inherits SA indicators", "seasonality_p": np.nan})
    log(f"  Chow-Lin BC GDP: rho={cl['rho']:.2f}, benchmarked to "
        f"{cl['benchmarked_until']:%Y}, extrapolated to {gdp_bc.index.max():%Y-%m}")

    # --- Derived variables -----------------------------------------------------
    levels["pop_growth_bc"] = 100 * np.log(levels["pop_bc"]).diff()          # % m/m
    levels["pop_growth_yoy_bc"] = 100 * np.log(levels["pop_bc"]).diff(12)    # % y/y
    raw_starts = raw["starts_van"].resample("MS").mean()
    levels["starts_van_12m"] = raw_starts.rolling(12).sum()                   # NSA, 12-m sum
    for k in ["pop_growth_bc", "pop_growth_yoy_bc"]:
        flags.append({"key": k, "native_freq": "Q", "interpolated": True, "modelled": False,
                      "seasonal_adjustment": "n/a (from interpolated population)",
                      "seasonality_p": np.nan})
    flags.append({"key": "starts_van_12m", "native_freq": "M", "interpolated": False,
                  "modelled": False, "seasonal_adjustment": "12-month sum (seasonality-neutral)",
                  "seasonality_p": np.nan})
    splice = {"median_spread": float(overlap.median()), "share_exact": share_exact, "ok": spread_ok}
    return levels, pd.DataFrame(flags).set_index("key"), {"chow_lin": cl, "policy_splice": splice}
