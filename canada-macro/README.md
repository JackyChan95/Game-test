# BC / Vancouver macro-econometric model

A small, re-runnable Python model of the British Columbia and Vancouver economy. It is built on
live public data from **Statistics Canada** (Web Data Service) and the **Bank of Canada**
(Valet API). Neither needs an API key.

```bash
pip install -r requirements.txt
python run.py --refresh --forecast 12     # download fresh data, 12-month forecasts, full report
python run.py --forecast 24               # reuse the newest cached data, 24-month horizon
python run.py --no-backtest               # skip backtests (about 10 s instead of about 60 s)
python -m pytest -q                       # offline unit tests
```

The report is written to `output/report.html` as a single self-contained file with embedded charts.

## What it does

| Step | Module | Method |
|---|---|---|
| Data | `macro/data/sources.py`, `cache.py` | Each StatCan series is defined by (table PID, member coordinate). At run time it is resolved with `getSeriesInfoFromCubePidCoord`, and the **vector ID and geography are checked** against `registry.py`. If any check fails, the run stops (exit code 2) instead of substituting a different series. Data come from `getDataFromVectorByReferencePeriodRange`. Raw JSON is cached as `data/raw/<source>/<key>__<UTC timestamp>.json`. A new file is written only when the content changes, so repeated `--refresh` runs are idempotent. |
| Panel | `macro/data/build.py` | Aligned to monthly. Daily BoC series → monthly mean. Quarterly population → PCHIP spline on log levels (**flagged interpolated**). Seasonal adjustment (STL on logs) is applied only to series StatCan doesn't adjust, and only if a monthly-dummy F-test finds seasonality. |
| BC GDP | `macro/models/chowlin.py` | StatCan publishes BC real GDP **annually only**. A Chow-Lin disaggregation gives a monthly series benchmarked to the annual totals. Indicators: Canada monthly real GDP and BC employment. **Flagged modelled.** |
| Stationarity | `macro/models/stationarity.py` | ADF + KPSS. A series counts as stationary only if ADF rejects and KPSS doesn't; otherwise it is log-differenced (×100), or differenced for rates. |
| BVAR | `macro/models/bvar.py` | Minnesota prior via dummy observations (Normal-inverse-Wishart, exact posterior draws). λ = 0.2. Lags by BIC. Variables: BC population growth, BC real GDP, BC employment, BC CPI, policy rate, Vancouver NHPI. Mar–Aug 2020 are dropped as dependent observations. 12–24 month forecasts with 68/90% bands; Cholesky IRFs to a +100bp rate shock. |
| Housing | `macro/models/housing.py` | Dynamic-OLS long-run relation of log Vancouver NHPI on the 5-yr mortgage rate, log BC wages, BC population growth and log Vancouver starts. Engle-Granger test, ECM speed of adjustment, pre-2020 stability check. |
| Nowcast | `macro/models/nowcast.py` | Mixed-frequency dynamic factor model (`statsmodels` `DynamicFactorMQ`) for current-quarter BC GDP growth. |
| Validation | `macro/models/backtest.py` | Expanding-window out-of-sample tests vs random walk and AR(1): RMSE, Diebold-Mariano, directional hit rate. Also a nowcast backtest, and an annual Chow-Lin test against **published** BC GDP. |
| Report | `macro/reports/` | Jinja2 HTML with matplotlib charts, plus a caveats section. |

## Series used

All StatCan vectors below were found from cube metadata and are re-verified on every run.

| Key | Table | Vector | Title (StatCan / BoC) | Geography | Units | Frequency / adjustment |
|---|---|---|---|---|---|---|
| `cpi_bc` | 18-10-0004 | v41692462 | All-items CPI | British Columbia | 2002=100 | M, NSA → STL in pipeline |
| `cpi_van` | 18-10-0004 | v41692930 | All-items CPI | Vancouver | 2002=100 | M, NSA → STL |
| `cpi_ca` | 18-10-0004 | v41690973 | All-items CPI | Canada | 2002=100 | M, NSA → STL |
| `emp_bc` | 14-10-0287 | v2064701 | LFS employment, 15+, both genders | British Columbia | persons, thousands | M, SA (StatCan) |
| `urate_bc` | 14-10-0287 | v2064705 | LFS unemployment rate, 15+ | British Columbia | % | M, SA |
| `emp_ca` | 14-10-0287 | v2062811 | LFS employment, 15+ | Canada | persons, thousands | M, SA |
| `awe_bc` | 14-10-0223 | v79311413 | Average weekly earnings incl. overtime, all employees, industrial aggregate excl. unclassified | British Columbia | $ | M, SA |
| `gdp_ca` | 36-10-0434 | v65201210 | GDP at basic prices, all industries, chained 2017 $ | Canada | $ millions, SAAR | M, SA |
| `gdp_bc_annual` | 36-10-0711 | v1793288710 | GDP at basic prices, all industries, chained 2017 $ | British Columbia | $ millions | **Annual** (→ Chow-Lin monthly) |
| `retail_bc` | 20-10-0056 | v1446860064 | Total retail sales | British Columbia | $ thousands | M, SA (from 2017) |
| `retail_van` | 20-10-0056 | v1446860095 | Total retail sales | Vancouver CMA | $ thousands | M, SA (from 2017) |
| `mfg_bc` | 16-10-0048 | v807928 | Sales of goods manufactured | British Columbia | $ thousands | M, SA |
| `pop_bc` | 17-10-0009 | v3 | Population estimate | British Columbia | persons | **Quarterly** (→ interpolated) |
| `pop_ca` | 17-10-0009 | v1 | Population estimate | Canada | persons | Quarterly (→ interpolated) |
| `nhpi_van` | 18-10-0205 | v111955556 | New Housing Price Index, total (house and land) | Vancouver | Dec 2016=100 | M, NSA (no significant seasonality found) |
| `nhpi_bc` | 18-10-0205 | v111955550 | NHPI, total | British Columbia | Dec 2016=100 | M, NSA |
| `nhpi_ca` | 18-10-0205 | v111955442 | NHPI, total | Canada | Dec 2016=100 | M, NSA |
| `starts_van` | 34-10-0154 | v42127505 | CMHC housing starts, total units | Vancouver CMA | units | M, NSA → STL; also 12-m sum |
| `permits_van` | 34-10-0292 | v1675120030 | Building permits, total residential, value | Vancouver CMA | $ thousands | M, SA (from 2018) |
| `mortgage5y` | 34-10-0145 | v733833 | CMHC conventional 5-year mortgage lending rate | Canada | % | M |
| `policy_rate` | BoC Valet | V39079 | Target for the overnight rate | Canada | % | Daily → monthly mean (from 2009-04) |
| `bank_rate` | BoC Valet | V122530 | Bank Rate | Canada | % | Monthly. Used only to extend the policy rate before 2009-04 (Bank Rate − 25bp; spread checked on overlap) |
| `gov5y` | BoC Valet | BD.CDN.5YR.DQ.YLD | GoC 5-year benchmark bond yield | Canada | % | Daily → monthly mean |
| `prime` | BoC Valet | V80691311 | Prime rate | Canada | % | Weekly → monthly mean |
| `cadusd` | BoC Valet | FXUSDCAD (inverted) | USD/CAD → CAD/USD | Canada | US$ per C$ | Daily → monthly mean (from 2017) |

### Departures from the original brief

These were confirmed during verification:

- **No sub-annual BC real GDP exists in StatCan's catalogue.** Monthly GDP by industry (36-10-0434) is Canada-only, and the experimental provincial activity index (36-10-0633) stopped in 2022. By agreement, BC GDP is Chow-Lin-disaggregated from annual table 36-10-0711.
- **Retail 20-10-0008 is inactive** (ends 2022). It is replaced by 20-10-0056, which starts in 2017. The nowcast factor model handles the missing early years.
- **Average weekly earnings** use the seasonally adjusted table 14-10-0223 rather than the unadjusted 14-10-0203. The "including unclassified" aggregate (v1544290292) has no published values, so the "excluding unclassified businesses" aggregate is used.
- **Vancouver building permits** come from 34-10-0292 and **housing starts** from CMHC table 34-10-0154.

## Layout

```
run.py                     CLI
macro/data/                registry (series list), sources (StatCan, BoC), cache, build (panel)
macro/models/              chowlin, stationarity, bvar, housing, nowcast, backtest
macro/reports/             charts, html, template.html
macro/pipeline.py          orchestration
tests/                     offline unit tests (synthetic data)
data/raw/                  timestamped raw JSON (git-ignored)
data/processed/            panel_monthly.csv, series_flags.csv, series_metadata.csv
output/report.html         the report
```

## Caveats (short version: read the report's section 7)

- The **NHPI covers new single, semi-detached and row houses only**. It excludes resale homes and condominium apartments.
- All series are **revised**. The backtests use today's data vintage, with full-sample seasonal factors and Chow-Lin estimates, so they are optimistic.
- **Structural breaks**: the 2020 pandemic, the effective lower bound (2009–15, 2020–21), and the 2022–23 rate hikes.
- Monthly BC GDP and the nowcast target are **modelled**, not observed.
- The housing levels relation **fails a cointegration test** on current data, so its elasticities are descriptive.
- This is a **trend and scenario tool**, not a valuation of individual properties.
