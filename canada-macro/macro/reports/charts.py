"""Matplotlib charts for the HTML report (PNG, embedded as base64).

Style: one y-axis per panel, thin 2px lines, recessive grid, fixed categorical
order (blue, orange, aqua), text in ink colours rather than series colours.
"""
import base64
import io

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.spines.top": False,
    "axes.spines.right": False, "font.size": 9, "axes.titlesize": 10, "axes.titlecolor": INK,
    "axes.titleweight": "bold", "lines.linewidth": 2, "legend.frameon": False,
})

LABELS = {
    "nhpi_van": "Vancouver NHPI (Dec 2016=100)", "emp_bc": "BC employment (thousands)",
    "gdp_bc": "BC real GDP, Chow-Lin (2017 $M, SAAR)", "cpi_bc_yoy": "BC CPI inflation (% y/y)",
    "cpi_bc": "BC CPI (2002=100)", "policy_rate": "Policy rate (%)",
    "pop_growth_bc": "BC population growth (% m/m)",
}
IRF_LABELS = {
    "nhpi_van": "Vancouver NHPI (% level)", "emp_bc": "BC employment (% level)",
    "gdp_bc": "BC real GDP (% level)", "cpi_bc": "BC CPI (% level)",
    "policy_rate": "Policy rate (pp)", "pop_growth_bc": "BC pop. growth (pp, m/m)",
}


def to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def _band(ax, x, df, color):
    ax.fill_between(x, df["p5"], df["p95"], color=color, alpha=0.15, lw=0, label="90% band")
    ax.fill_between(x, df["p16"], df["p84"], color=color, alpha=0.35, lw=0, label="68% band")
    ax.plot(x, df["p50"], color=color, label="Median")


def fan_chart(bvar: dict, levels: pd.DataFrame, start: str = "2018-01-01") -> str:
    keys = ["nhpi_van", "emp_bc", "gdp_bc", "cpi_bc_yoy", "policy_rate", "pop_growth_bc"]
    fig, axes = plt.subplots(2, 3, figsize=(12, 6.2))
    origin = bvar["origin"]
    for ax, k in zip(axes.flat, keys):
        if k == "cpi_bc_yoy":
            hist = 100 * np.log(levels["cpi_bc"]).diff(12)
        else:
            hist = levels[k]
        h = hist.loc[start:origin]
        after = hist.loc[origin + pd.offsets.MonthBegin(1):].dropna()
        ax.plot(h.index, h.values, color=INK2, lw=1.5, label="History")
        _band(ax, bvar["fan"][k].index, bvar["fan"][k], BLUE)
        if len(after):
            ax.plot(after.index, after.values, "o", ms=4, color=INK, label="Released after origin")
        ax.axvline(origin, color=INK2, lw=0.8, ls=":")
        ax.xaxis.set_major_locator(mdates.YearLocator(2))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
        ax.set_title(LABELS[k], loc="left")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=5, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return to_base64(fig)


def irf_chart(irf: dict) -> str:
    keys = ["nhpi_van", "emp_bc", "gdp_bc", "cpi_bc", "policy_rate", "pop_growth_bc"]
    fig, axes = plt.subplots(2, 3, figsize=(12, 6))
    for ax, k in zip(axes.flat, keys):
        df = irf[k]
        _band(ax, df.index, df, BLUE)
        ax.axhline(0, color=INK2, lw=0.8)
        ax.set_title(IRF_LABELS[k], loc="left")
        ax.set_xlabel("Months after shock")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return to_base64(fig)


def elasticity_chart(table: pd.DataFrame) -> str:
    samples = list(dict.fromkeys(table["sample"]))
    colors = dict(zip(samples, [BLUE, ORANGE]))
    fig, axes = plt.subplots(1, 2, figsize=(12, 3.4))
    for ax, kind, title in [(axes[0], "elasticity", "Elasticities (% per 1%)"),
                            (axes[1], "semi", "Semi-elasticities (% per 1 percentage point)")]:
        sub = table[table["type"].str.startswith(kind)]
        names = list(dict.fromkeys(sub["variable"]))
        for i, s in enumerate(samples):
            r = sub[sub["sample"] == s].set_index("variable").loc[names]
            y = np.arange(len(names)) + (i - 0.5) * 0.28
            ax.errorbar(r["estimate"], y, xerr=[r["estimate"] - r["ci_low"], r["ci_high"] - r["estimate"]],
                        fmt="o", ms=8, color=colors[s], ecolor=colors[s], elinewidth=2, capsize=0,
                        label=s)
        ax.axvline(0, color=INK2, lw=0.8)
        ax.set_yticks(range(len(names)), names)
        ax.set_title(title, loc="left")
        ax.grid(axis="y", visible=False)
    axes[0].legend(loc="lower center", bbox_to_anchor=(1.1, -0.42), ncol=2)
    fig.tight_layout()
    return to_base64(fig)


def ecm_fit_chart(h: dict) -> str:
    fig, ax = plt.subplots(figsize=(12, 3.4))
    ax.plot(h["actual"].index, np.exp(h["actual"]), color=BLUE, label="Vancouver NHPI (actual)")
    ax.plot(h["fitted"].index, np.exp(h["fitted"]), color=ORANGE, label="Long-run (DOLS) fitted value")
    ax.set_title("Vancouver NHPI vs its estimated long-run relation", loc="left")
    ax.legend(loc="upper left")
    fig.tight_layout()
    return to_base64(fig)


def nowcast_chart(nc: dict, n_hist: int = 20) -> str:
    t = nc["target"].iloc[-n_hist:]
    fig, ax = plt.subplots(figsize=(12, 3.6))
    x = [str(q) for q in t.index]
    ax.bar(x, t.values, color=BLUE, width=0.7, label="Chow-Lin BC GDP growth (target)")
    for q, v in nc["nowcasts"].items():
        ax.errorbar([q], [v["mean"]], yerr=[[v["mean"] - v["lo90"]], [v["hi90"] - v["mean"]]],
                    fmt="none", ecolor=ORANGE, elinewidth=1.2, capsize=0)
        ax.errorbar([q], [v["mean"]], yerr=[[v["mean"] - v["lo68"]], [v["hi68"] - v["mean"]]],
                    fmt="o", ms=8, color=ORANGE, ecolor=ORANGE, elinewidth=3, capsize=0)
    ax.plot([], [], "o", color=ORANGE, label="DFM nowcast (68% thick, 90% thin)")
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_ylabel("% q/q (not annualised)")
    ax.tick_params(axis="x", rotation=60)
    ax.set_title("BC real GDP growth: recent quarters and nowcast", loc="left", pad=28)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2)
    fig.tight_layout()
    return to_base64(fig)


def backtest_chart(summary: pd.DataFrame) -> str:
    vars_ = ["nhpi_van", "emp_bc", "gdp_bc", "cpi_bc", "policy_rate", "pop_growth_bc"]
    fig, axes = plt.subplots(2, 3, figsize=(12, 5.8), sharex=True)
    for ax, v in zip(axes.flat, vars_):
        s = summary[summary["var"] == v]
        ax.plot(s["h"], s["BVAR/RW"], "-o", ms=6, color=BLUE, label="BVAR")
        ax.plot(s["h"], s["AR(1)/RW"], "-o", ms=6, color=ORANGE, label="AR(1)")
        ax.axhline(1, color=INK2, lw=1, ls="--", label="Random walk = 1")
        ax.set_title(IRF_LABELS[v].split(" (")[0], loc="left")
        ax.set_xticks([1, 3, 6, 12])
    for ax in axes[1]:
        ax.set_xlabel("Horizon (months)")
    for ax in axes[:, 0]:
        ax.set_ylabel("RMSE relative to random walk")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    return to_base64(fig)


def nowcast_backtest_chart(ncb: pd.DataFrame) -> str:
    fig, ax = plt.subplots(figsize=(12, 3.4))
    x = np.arange(len(ncb))
    ax.plot(x, ncb["actual"], color=BLUE, label="Target (Chow-Lin BC GDP, % q/q)")
    ax.plot(x, ncb["DFM"], color=ORANGE, label="DFM nowcast (pseudo out-of-sample)")
    ax.plot(x, ncb["AR(1)"], color=AQUA, lw=1.5, label="AR(1)")
    step = max(1, len(ncb) // 14)
    ax.set_xticks(x[::step], ncb.index[::step], rotation=60)
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_title("Nowcast backtest: target vs pseudo out-of-sample nowcasts (% q/q)", loc="left", pad=28)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=3)
    fig.tight_layout()
    return to_base64(fig)


def chowlin_chart(levels: pd.DataFrame, annual: pd.Series) -> str:
    fig, ax = plt.subplots(figsize=(12, 3.4))
    m = levels["gdp_bc"].dropna().loc["2010":]
    ax.plot(m.index, m.values, color=BLUE, label="Monthly estimate (Chow-Lin)")
    a = annual.loc["2010":]
    for i, (d, v) in enumerate(a.items()):
        ax.hlines(v, d, d + pd.offsets.YearEnd(0), color=ORANGE, lw=3,
                  label="Published annual BC GDP" if i == 0 else None)
    ax.set_title("BC real GDP: published annual levels and monthly disaggregation (2017 $M)", loc="left")
    ax.legend(loc="upper left")
    fig.tight_layout()
    return to_base64(fig)


# ----------------------------------------------------------------------------- game-style health card
TIER_COLORS = {"STRONG": "#0ca30c", "OK": "#fab219", "WEAK": "#ec835a", "CRITICAL": "#d03b3b"}
TIER_ICONS = {"STRONG": "▲", "OK": "●", "WEAK": "▼", "CRITICAL": "✖"}


def health_card(h: dict, today) -> str:
    """Dark 'character sheet': HP bar, radar of stats, and stat bars with tier labels."""
    bg, panel, ink, ink2, blue = "#1a1a19", "#242423", "#f0efec", "#c3c2b7", "#3987e5"
    t = h["table"]
    with plt.rc_context({"font.family": "DejaVu Sans Mono", "axes.grid": False}):
        fig = plt.figure(figsize=(12, 6.4), facecolor=bg)
        fig.text(0.03, 0.93, "BRITISH COLUMBIA ECONOMY", color=ink, fontsize=17, weight="bold")
        fig.text(0.03, 0.885, f"STATUS CHECK · {today:%Y-%m-%d} · scores = rank vs own history "
                 f"since {h['start'][:4]} (100 = best month)", color=ink2, fontsize=8.5)

        # HP bar
        ax = fig.add_axes([0.03, 0.78, 0.94, 0.06], facecolor=panel)
        col = TIER_COLORS[h["tier"]]
        ax.barh([0], [100], color=panel, height=1)
        ax.barh([0], [h["hp"]], color=col, height=1)
        for x in range(10, 100, 10):                      # segment notches like a game HP bar
            ax.axvline(x, color=bg, lw=2)
        ax.set_xlim(0, 100); ax.set_ylim(-0.5, 0.5); ax.axis("off")
        ax.text(1, 0, "HP", color=bg, fontsize=12, weight="bold", va="center")
        fig.text(0.97, 0.855, f"{h['hp']:.0f} / 100  {TIER_ICONS[h['tier']]} {h['tier']}",
                 color=ink, fontsize=12, weight="bold", ha="right")

        # Radar
        n = len(t)
        ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
        ax = fig.add_axes([0.02, 0.05, 0.42, 0.66], polar=True, facecolor=bg)
        ax.set_theta_offset(np.pi / 2); ax.set_theta_direction(-1)
        for r in (25, 50, 75, 100):
            ax.plot(np.append(ang, ang[0]), [r] * (n + 1), color="#3a3a38", lw=1)
        for a in ang:
            ax.plot([a, a], [0, 100], color="#3a3a38", lw=1)
        vals = np.append(t["score"].values, t["score"].values[0])
        ax.fill(np.append(ang, ang[0]), vals, color=blue, alpha=0.35)
        ax.plot(np.append(ang, ang[0]), vals, color=blue, lw=2)
        ax.plot(ang, t["score"], "o", ms=8, color=blue, mec=bg, mew=2)
        ax.set_ylim(0, 100); ax.set_yticks([]); ax.spines["polar"].set_visible(False)
        ax.set_xticks(ang, [s.upper() for s in t["stat"]], color=ink, fontsize=9, weight="bold")
        ax.tick_params(axis="x", pad=8)

        # Stat bars
        ax = fig.add_axes([0.56, 0.08, 0.41, 0.62], facecolor=bg)
        y = np.arange(n)[::-1]
        for yi, r in zip(y, t.itertuples()):
            c = TIER_COLORS[r.tier]
            ax.barh(yi, 100, color=panel, height=0.55)
            ax.barh(yi, r.score, color=c, height=0.55)
            for x in range(10, 100, 10):
                ax.plot([x, x], [yi - 0.275, yi + 0.275], color=bg, lw=1.5)
            ax.text(-3, yi + 0.02, r.stat.upper(), color=ink, ha="right", va="center",
                    fontsize=10, weight="bold")
            ax.text(103, yi + 0.02, f"{r.score:3.0f} {TIER_ICONS[r.tier]} {r.tier}", color=ink,
                    va="center", fontsize=9.5)
            ax.text(0, yi - 0.42, r.indicator, color=ink2, fontsize=7, va="center")
        ax.set_xlim(0, 100); ax.set_ylim(-0.8, n - 0.4); ax.axis("off")
        return to_base64(fig)
