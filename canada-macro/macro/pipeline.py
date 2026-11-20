"""End-to-end pipeline: data -> panel -> models -> results dict for the report."""
from pathlib import Path

import numpy as np
import pandas as pd

from .data.build import build_panel
from .data.registry import BVAR_VARS, SERIES
from .data.sources import load_all
from .models import backtest as bt
from .models import chowlin, health, housing, nowcast
from .models.bvar import MinnesotaBVAR, select_lags_bic
from .models.stationarity import stationarity_report

ROOT = Path(__file__).resolve().parent.parent
LAMBDA = 0.2           # Minnesota overall tightness
DELTA_LEVEL = 0.9      # prior own-lag mean for series modelled in levels
PCTS = [5, 16, 50, 84, 95]


def _level_form(levels: pd.DataFrame, forms: dict) -> pd.DataFrame:
    """Level counterpart of each model variable: 100*log level or the rate itself."""
    return pd.DataFrame({c: (100 * np.log(levels[c]) if "log" in forms[c] else levels[c])
                         for c in forms})


def run_bvar(levels: pd.DataFrame, horizon: int, log=print) -> dict:
    data = levels[BVAR_VARS].dropna()
    Z, forms, stat_rep = stationarity_report(data)
    Z = Z.dropna()
    differenced = {c: forms[c] in ("100*dlog (% m/m)", "first difference") for c in forms}
    L = _level_form(data, forms).loc[Z.index]
    p = select_lags_bic(Z, maxlags=12)
    delta = [0.0 if differenced[c] else DELTA_LEVEL for c in Z.columns]
    model = MinnesotaBVAR(p, LAMBDA, delta).fit(Z)
    log(f"  BVAR: {len(Z)} obs {Z.index.min():%Y-%m}..{Z.index.max():%Y-%m}, p={p} (BIC), lambda={LAMBDA}")

    # Forecast paths -> levels.
    sims = model.simulate(horizon, ndraws=2000)
    origin = Z.index.max()
    fidx = pd.date_range(origin + pd.offsets.MonthBegin(1), periods=horizon, freq="MS")
    fan = {}
    for j, c in enumerate(Z.columns):
        last = L[c].iloc[-1]
        lv = last + np.cumsum(sims[:, :, j], axis=1) if differenced[c] else sims[:, :, j]
        if "log" in forms[c]:
            lv_out = np.exp(lv / 100)
        else:
            lv_out = lv
        fan[c] = pd.DataFrame(np.percentile(lv_out, PCTS, axis=0).T, index=fidx,
                              columns=[f"p{q}" for q in PCTS])
        if c == "cpi_bc":   # also year-over-year inflation
            hist = 100 * np.log(data[c]).values[-12:]
            full = np.concatenate([np.tile(hist, (lv.shape[0], 1)), lv], axis=1)
            yoy = full[:, 12:] - full[:, :-12]
            fan["cpi_bc_yoy"] = pd.DataFrame(np.percentile(yoy, PCTS, axis=0).T, index=fidx,
                                             columns=[f"p{q}" for q in PCTS])

    # Impulse responses to a +100bp policy-rate shock.
    k = list(Z.columns).index("policy_rate")
    irfs, dropped = model.irf(k, h=24, ndraws=1000, scale=1.0)
    # Sensitivity: the same IRF without the COVID-month exclusion.
    alt = MinnesotaBVAR(p, LAMBDA, delta).fit(Z, exclude_covid=False)
    irfs_alt, _ = alt.irf(k, h=24, ndraws=1000, scale=1.0)
    irf_alt = {c: (np.cumsum(irfs_alt[:, :, j], axis=1) if differenced[c] else irfs_alt[:, :, j])
               for j, c in enumerate(Z.columns)}
    irf_alt = {c: pd.DataFrame(np.percentile(v, PCTS, axis=0).T, columns=[f"p{q}" for q in PCTS])
               for c, v in irf_alt.items()}
    irf = {}
    for j, c in enumerate(Z.columns):
        resp = np.cumsum(irfs[:, :, j], axis=1) if differenced[c] else irfs[:, :, j]
        irf[c] = pd.DataFrame(np.percentile(resp, PCTS, axis=0).T, columns=[f"p{q}" for q in PCTS])
    return {"Z": Z, "L": L, "forms": forms, "differenced": differenced, "stationarity": stat_rep,
            "p": p, "fan": fan, "irf": irf, "irf_no_covid_excl": irf_alt, "irf_dropped": dropped, "origin": origin,
            "history": data, "model": model}


def run(refresh: bool, horizon: int, do_backtest: bool = True, log=print,
        today: pd.Timestamp | None = None) -> dict:
    today = today or pd.Timestamp.today().normalize()
    raw_dir = ROOT / "data" / "raw"
    log("[1/6] Data (StatCan WDS + Bank of Canada Valet)")
    raw, meta = load_all(SERIES, raw_dir, refresh, log=log)
    levels, flags, info = build_panel(raw, today=today, log=log)
    proc = ROOT / "data" / "processed"
    proc.mkdir(parents=True, exist_ok=True)
    levels.to_csv(proc / "panel_monthly.csv")
    flags.to_csv(proc / "series_flags.csv")
    meta.to_csv(proc / "series_metadata.csv", index=False)

    log("[2/6] Stationarity + BVAR")
    bvar = run_bvar(levels, horizon, log=log)

    log("[3/6] Housing error-correction model")
    hous = housing.run(levels)
    log(f"  EG cointegration p={hous['eg_p']:.3f}, adjustment speed={hous['gamma']:.3f}/month")

    log("[4/6] Nowcast (dynamic factor model)")
    nc = nowcast.run(levels, today)
    cur = nc["nowcasts"].get(nc["current_quarter"], {})
    log(f"  {nc['current_quarter']} BC GDP nowcast: {cur.get('mean', float('nan')):.2f}% q/q")

    results_health = health.compute(levels)
    log(f"  Economy HP: {results_health['hp']:.0f}/100 ({results_health['tier']})")
    results = {"health": results_health, "gdp_bc_annual": raw["gdp_bc_annual"].dropna(), "meta": meta, "flags": flags, "levels": levels, "info": info, "bvar": bvar,
               "housing": hous, "nowcast": nc, "today": today, "horizon": horizon}

    if do_backtest:
        log("[5/6] Backtests (expanding window)")
        fc = bt.run(bvar["Z"], bvar["L"], bvar["differenced"])
        covid = (fc["origin"] >= "2019-12-01") & (fc["origin"] <= "2021-06-01")
        results["backtest_fc"] = fc
        results["backtest"] = bt.summarize(fc)
        results["backtest_ex_covid"] = bt.summarize(fc[~covid])
        ncb = nowcast.backtest(levels)
        results["nowcast_backtest"] = ncb
        results["chowlin_backtest"] = chowlin.backtest_annual(
            raw["gdp_bc_annual"].dropna(), levels[["gdp_ca", "emp_bc"]])
    return results
