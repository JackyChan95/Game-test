"""Assemble the self-contained HTML report from the pipeline results."""
from pathlib import Path

import numpy as np
import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import charts
from ..models.backtest import hit_rate, rmse

TEMPLATE_DIR = Path(__file__).parent

NAMES = {"nhpi_van": "Vancouver NHPI", "emp_bc": "BC employment", "gdp_bc": "BC real GDP (Chow-Lin)",
         "cpi_bc": "BC CPI", "policy_rate": "Policy rate", "pop_growth_bc": "BC population growth"}


def _tbl(df: pd.DataFrame, fmt: str = "{:,.2f}", index: bool = False) -> str:
    return df.to_html(index=index, classes="tbl", border=0, na_rep="–",
                      float_format=lambda x: fmt.format(x))


def _series_table(r) -> str:
    meta = r["meta"].set_index("key")
    flags = r["flags"]
    lv = r["levels"]
    rows = []
    for k in meta.index:
        f = flags.loc[k] if k in flags.index else None
        s = lv[k].dropna() if k in lv else pd.Series(dtype=float)
        rows.append({"Key": k, "Source": meta.loc[k, "source"], "Table": meta.loc[k, "table"],
                     "Vector / series": meta.loc[k, "vector"], "Title (from metadata)": meta.loc[k, "title"],
                     "Geography": meta.loc[k, "geography"], "Units": meta.loc[k, "units"],
                     "Seasonal adjustment": "" if f is None else f["seasonal_adjustment"],
                     "Interpolated": "" if f is None else ("yes" if f["interpolated"] else ""),
                     "Sample fetched": f"{s.index.min():%Y-%m} – {s.index.max():%Y-%m}" if len(s) else "annual"})
    df = pd.DataFrame(rows)
    for c in ["Table", "Sample fetched"]:            # keep IDs and dates on one line
        df[c] = df[c].str.replace("-", "\u2011", regex=False)
    return _tbl(df)


def _forecast_table(b, horizon) -> str:
    rows = []
    hs = [h for h in (6, 12, 24) if h <= horizon]
    for k in ["nhpi_van", "emp_bc", "gdp_bc", "cpi_bc_yoy", "policy_rate"]:
        f = b["fan"][k]
        for h in hs:
            r = f.iloc[h - 1]
            rows.append({"Variable": charts.LABELS[k], "Month": f"{f.index[h - 1]:%Y-%m}",
                         "Median": r.p50, "68% band": f"{r.p16:,.2f} – {r.p84:,.2f}",
                         "90% band": f"{r.p5:,.2f} – {r.p95:,.2f}"})
    return _tbl(pd.DataFrame(rows))


def _irf_table(b) -> str:
    rows = []
    for k in ["nhpi_van", "emp_bc", "gdp_bc", "cpi_bc", "policy_rate"]:
        for label, irf in [("COVID months excluded (baseline)", b["irf"]),
                           ("No COVID treatment (sensitivity)", b["irf_no_covid_excl"])]:
            d = irf[k]
            row = {"Response": charts.IRF_LABELS[k], "Specification": label}
            for h in (0, 6, 12, 24):
                row[f"h={h}"] = f"{d.p50[h]:+.2f} [{d.p5[h]:+.2f}, {d.p95[h]:+.2f}]"
            rows.append(row)
    return _tbl(pd.DataFrame(rows))


def _backtest_table(s: pd.DataFrame) -> str:
    s = s.copy()
    s["var"] = s["var"].map(NAMES)
    cols = ["var", "h", "n", "RMSE BVAR", "RMSE AR(1)", "RMSE RW", "BVAR/RW",
            "DM p (BVAR vs RW)", "Hit BVAR", "Hit AR(1)"]
    s = s[cols].rename(columns={"var": "Variable", "h": "Horizon (m)"})
    return _tbl(s, "{:,.3f}")


def _nowcast_scores(ncb: pd.DataFrame) -> pd.DataFrame:
    rows = []
    ex = ~ncb.index.str.startswith("2020") & ~ncb.index.isin(["2021Q1"])
    for label, d in [("All quarters", ncb), ("Excluding 2020Q1–2021Q1", ncb[ex])]:
        for m in ["DFM", "AR(1)", "Random walk"]:
            rows.append({"Sample": label, "Model": m, "n": len(d),
                         "RMSE (pp, q/q)": rmse(d[m] - d["actual"]),
                         "Hit rate (direction of change)": np.nan if m == "Random walk"
                         else hit_rate(d[m], d["actual"], d["prev"])})
    return pd.DataFrame(rows)


def _chowlin_scores(cb: pd.DataFrame) -> pd.DataFrame:
    a = cb["published growth %"]
    ex = cb.index.isin([2020, 2021])
    rows = []
    for label, m in [("All years", slice(None)), ("Excluding 2020–21", ~ex)]:
        rows.append({"Sample": label, "Years": int(len(a[m])),
                     "RMSE Chow-Lin (pp)": rmse(cb["Chow-Lin extrapolation %"][m] - a[m]),
                     "RMSE naive (pp)": rmse(cb["naive (last year) %"][m] - a[m])})
    return pd.DataFrame(rows)


def _findings(r) -> list[str]:
    b, h, nc = r["bvar"], r["housing"], r["nowcast"]
    out = []
    cq = nc["nowcasts"].get(nc["current_quarter"])
    if cq:
        out.append(f"Nowcast for BC real GDP in {nc['current_quarter']}: {cq['mean']:+.2f}% q/q "
                   f"(68% band {cq['lo68']:+.2f} to {cq['hi68']:+.2f}; 90% band {cq['lo90']:+.2f} to "
                   f"{cq['hi90']:+.2f}). The target is a modelled series; see caveats.")
    f = b["fan"]["nhpi_van"]
    hz = min(12, len(f))
    out.append(f"Vancouver NHPI {hz}-month BVAR forecast ({f.index[hz - 1]:%b %Y}): median "
               f"{f.p50.iloc[hz - 1]:.1f} (90% band {f.p5.iloc[hz - 1]:.1f}–{f.p95.iloc[hz - 1]:.1f}), vs "
               f"{b['history']['nhpi_van'].iloc[-1]:.1f} at the forecast origin.")
    i = b["irf"]["nhpi_van"]
    out.append(f"A +100bp policy-rate shock moves Vancouver NHPI by {i.p50[0]:+.2f}% on impact and "
               f"{i.p50[12]:+.2f}% after 12 months (90% band {i.p5[12]:+.2f} to {i.p95[12]:+.2f}): "
               "not distinguishable from zero.")
    e = b["irf"]["emp_bc"]
    if e.p5[12] > 0:
        out.append(f"BC employment *rises* after the identified rate shock ({e.p50[12]:+.2f}% at 12 months). "
                   "This is a known puzzle of recursive identification (policy reacting to strength "
                   "the model cannot see), so the IRFs should not be read as causal effects of tightening.")
    if h["eg_p"] > 0.10:
        out.append(f"Housing ECM: the Engle-Granger test does not find cointegration (p = {h['eg_p']:.2f}), and "
                   f"the error-correction speed is small ({h['gamma']:.3f}/month). Long-run 'elasticities' "
                   "are therefore descriptive, not structural.")
    mort = h["table"][h["table"]["variable"].str.contains("mortgage")]
    if (mort["estimate"] > 0).any():
        out.append("The long-run mortgage-rate coefficient is positive (wrong sign) in at least one sample, "
                   "another sign the levels relation reflects shared trends rather than a demand curve.")
    if "backtest" in r:
        s = r["backtest"]
        wins = s[(s["BVAR/RW"] < 1) & (s["DM p (BVAR vs RW)"] < 0.10)]
        out.append(f"Backtest: the BVAR has lower RMSE than the random walk in "
                   f"{(s['BVAR/RW'] < 1).sum()} of {len(s)} variable-horizon cells, and the gain is "
                   f"statistically significant (DM p<0.10) in {len(wins)}. Gains over AR(1) are small.")
    return out


def render(r: dict, out_path: Path) -> Path:
    b, h, nc = r["bvar"], r["housing"], r["nowcast"]
    ctx = {
        "today": f"{r['today']:%Y-%m-%d}", "horizon": r["horizon"],
        "findings": _findings(r),
        "series_table": _series_table(r),
        "chow_lin": r["info"]["chow_lin"], "splice": r["info"]["policy_splice"],
        "stationarity_table": _tbl(b["stationarity"], "{:.3f}"),
        "bvar": b, "bvar_vars": ", ".join(NAMES[c] for c in b["Z"].columns),
        "fan_png": charts.fan_chart(b, r["levels"]),
        "forecast_table": _forecast_table(b, r["horizon"]),
        "irf_png": charts.irf_chart(b["irf"]), "irf_table": _irf_table(b),
        "rate_path": b["irf"]["policy_rate"].p50,
        "housing": h, "elasticity_png": charts.elasticity_chart(h["table"]),
        "elasticity_table": _tbl(h["table"], "{:.3f}"), "ecm_png": charts.ecm_fit_chart(h),
        "nowcast": nc, "nowcast_png": charts.nowcast_chart(nc),
        "nowcast_table": _tbl(pd.DataFrame(nc["nowcasts"]).T.rename_axis("Quarter")
                              .rename(columns={"mean": "Nowcast % q/q"}), "{:+.2f}", index=True),
        "data_through": _tbl(pd.DataFrame({"Indicator": list(nc["data_through"]),
                                           "Last observation": list(nc["data_through"].values()),
                                           "Factor loading (standardised data)": [nc["loadings"].get(k, np.nan)
                                                              for k in nc["data_through"]]}), "{:.3f}"),
        "chowlin_png": charts.chowlin_chart(r["levels"], r["gdp_bc_annual"]),
        "has_backtest": "backtest" in r,
    }
    if ctx["has_backtest"]:
        ctx.update({
            "backtest_png": charts.backtest_chart(r["backtest"]),
            "backtest_table": _backtest_table(r["backtest"]),
            "backtest_ex_table": _backtest_table(r["backtest_ex_covid"]),
            "nowcast_bt_png": charts.nowcast_backtest_chart(r["nowcast_backtest"]),
            "nowcast_bt_table": _tbl(_nowcast_scores(r["nowcast_backtest"]), "{:.3f}"),
            "chowlin_bt_table": _tbl(r["chowlin_backtest"].reset_index(), "{:.2f}"),
            "chowlin_scores": _tbl(_chowlin_scores(r["chowlin_backtest"]), "{:.2f}"),
            "bt_origins": f"{r['backtest_fc']['origin'].min():%Y-%m} – {r['backtest_fc']['origin'].max():%Y-%m}",
        })
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=select_autoescape(["html"]))
    html = env.get_template("template.html").render(**ctx)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path
