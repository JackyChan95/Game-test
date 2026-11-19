"""Models: Chow-Lin, stationarity, BVAR, housing ECM, backtest metrics, nowcast inputs."""
import numpy as np
import pandas as pd

from macro.models import backtest as bt
from macro.models import housing
from macro.models.bvar import MinnesotaBVAR, covid_mask, select_lags_bic
from macro.models.chowlin import chow_lin
from macro.models.nowcast import quarterly_target
from macro.models.stationarity import transform


def test_chow_lin_respects_annual_totals():
    rng = np.random.default_rng(1)
    idx = pd.date_range("2000-01-01", periods=12 * 10 + 5, freq="MS")
    x = pd.DataFrame({"ind": 100 + np.cumsum(rng.normal(0.3, 1, len(idx)))}, index=idx)
    true = 50 + 2 * x["ind"] + np.cumsum(rng.normal(0, 0.5, len(idx)))
    annual = true.iloc[:120].groupby(true.index[:120].year).mean()
    annual.index = pd.to_datetime([f"{y}-01-01" for y in annual.index])
    m, info = chow_lin(annual, x)
    agg = m.iloc[:120].groupby(m.index[:120].year).mean().values
    assert np.allclose(agg, annual.values, atol=1e-6)            # exact benchmarking
    assert len(m) == len(idx)                                     # extrapolates 5 months
    assert np.corrcoef(m.diff().dropna(), true.diff().dropna())[0, 1] > 0.6
    assert info["benchmarked_until"] == pd.Timestamp("2009-12-01")


def test_stationarity_decisions():
    rng = np.random.default_rng(2)
    idx = pd.date_range("1990-01-01", periods=400, freq="MS")
    rw = pd.Series(np.exp(np.cumsum(rng.normal(0.002, 0.01, 400))), idx)
    _, form, _ = transform("emp_bc", rw)
    assert form == "100*dlog (% m/m)"
    wn = pd.Series(rng.normal(0, 1, 400), idx)
    _, form, _ = transform("policy_rate", wn)
    assert form == "level"


def _sim_var(T=600, seed=3):
    rng = np.random.default_rng(seed)
    A = np.array([[0.5, 0.1], [0.0, 0.3]])
    Y = np.zeros((T, 2))
    for t in range(1, T):
        Y[t] = A @ Y[t - 1] + rng.normal(0, 1, 2)
    idx = pd.date_range("1960-01-01", periods=T, freq="MS")
    return pd.DataFrame(Y, idx, columns=["a", "b"]), A


def test_bvar_recovers_coefficients_with_loose_prior():
    Y, A = _sim_var()
    m = MinnesotaBVAR(p=1, lam=10.0).fit(Y)
    assert np.allclose(m.B[:2].T, A, atol=0.08)
    assert select_lags_bic(Y, maxlags=4) == 1


def test_bvar_tight_prior_shrinks_to_zero():
    Y, _ = _sim_var()
    m = MinnesotaBVAR(p=1, lam=1e-4).fit(Y)
    assert np.abs(m.B[:2]).max() < 0.01


def test_bvar_irf_normalisation_and_forecast_shapes():
    Y, _ = _sim_var()
    m = MinnesotaBVAR(p=2, lam=0.2).fit(Y)
    irfs, dropped = m.irf(shock=1, h=12, ndraws=50, scale=1.0)
    assert irfs.shape[1:] == (13, 2) and np.allclose(irfs[:, 0, 1], 1.0)
    assert np.allclose(irfs[:, 0, 0], 0.0)                         # recursive: a ordered first
    assert m.simulate(6, ndraws=20).shape == (20, 6, 2)
    assert m.forecast_mean(6).shape == (6, 2)


def test_covid_rows_are_excluded_from_estimation():
    idx = pd.date_range("2019-01-01", periods=36, freq="MS")
    assert covid_mask(idx).sum() == 6


def test_housing_dols_recovers_long_run_elasticity():
    rng = np.random.default_rng(4)
    T = 300
    idx = pd.date_range("2001-01-01", periods=T, freq="MS")
    log_awe = np.cumsum(rng.normal(0.003, 0.01, T)) + 6.5
    mort = 5 + np.cumsum(rng.normal(0, 0.1, T))
    pop = 1.5 + np.cumsum(rng.normal(0, 0.05, T))
    log_starts = 10 + np.cumsum(rng.normal(0, 0.03, T))
    u = np.zeros(T)
    for t in range(1, T):
        u[t] = 0.8 * u[t - 1] + rng.normal(0, 0.01)
    log_nhpi = -2 + 1.2 * log_awe - 0.04 * mort + 0.02 * pop + 0.1 * log_starts + u
    lv = pd.DataFrame({"nhpi_van": np.exp(log_nhpi), "awe_bc": np.exp(log_awe), "mortgage5y": mort,
                       "pop_growth_yoy_bc": pop, "starts_van_12m": np.exp(log_starts)}, idx)
    out = housing.run(lv)
    full = out["table"].iloc[:4].set_index("variable")["estimate"]
    assert abs(full["BC avg weekly earnings"] - 1.2) < 0.1
    assert abs(full["5-yr mortgage rate"] - (-4.0)) < 1.5         # semi-elasticity in % per pp
    assert out["eg_p"] < 0.05 and out["gamma"] < 0


def test_backtest_metrics():
    assert bt.rmse([3, -4]) == np.sqrt(12.5)
    assert bt.hit_rate([1, 1, -1], [2, -1, -1], [0, 0, 0]) == 2 / 3
    rng = np.random.default_rng(5)
    e = rng.normal(0, 1, 200)
    assert bt.diebold_mariano(e, e * 3, 1) < 0.01                  # clearly better
    assert np.isnan(bt.diebold_mariano(e, -e, 1))                 # identical losses: undefined


def test_backtest_run_columns():
    Y, _ = _sim_var(T=200)
    L = Y.cumsum()
    fc = bt.run(Y, L, {"a": True, "b": True}, start=str(Y.index[150].date()), horizons=(1, 3))
    s = bt.summarize(fc)
    assert set(s["h"]) == {1, 3}
    assert {"BVAR/RW", "Hit BVAR", "DM p (BVAR vs RW)"} <= set(s.columns)


def test_quarterly_target_uses_complete_quarters():
    idx = pd.date_range("2020-01-01", periods=11, freq="MS")      # Q4 has 2 months only
    g = pd.Series(np.linspace(100, 110, 11), idx)
    q = quarterly_target(g)
    assert [str(p) for p in q.index] == ["2020Q2", "2020Q3"]
