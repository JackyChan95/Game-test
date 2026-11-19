"""Registry of every series the model uses.

StatCan series are identified by (table PID, member coordinate). At run time the
coordinate is resolved through getSeriesInfoFromCubePidCoord and the returned
vector ID must equal ``expected_vector`` and its title must contain ``geo``.
The expected IDs were found from cube metadata (getCubeMetadata), not memory; the
run-time check guards against StatCan re-basing or re-coding a table.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Series:
    key: str                 # short name used throughout the code
    source: str              # "statcan" or "boc"
    description: str
    freq: str                # "M" monthly, "Q" quarterly, "A" annual, "D" daily
    geo: str = ""            # geography text expected in the StatCan title
    pid: int = 0             # StatCan 8-digit product ID
    coord: tuple = ()        # member IDs per dimension
    expected_vector: int = 0
    boc_name: str = ""       # Bank of Canada Valet series name
    statcan_adjusted: bool = False  # True if StatCan already seasonally adjusts it
    seasonal_check: bool = True     # rates/prices-of-money are never adjusted
    invert: bool = False     # invert the value (USD/CAD -> CAD/USD)
    tags: tuple = field(default_factory=tuple)

    @property
    def coordinate(self) -> str:
        """StatCan uses a 10-member dotted coordinate, padded with zeros."""
        c = list(self.coord) + [0] * (10 - len(self.coord))
        return ".".join(str(x) for x in c)


S = Series
SERIES = [
    # --- Prices ---------------------------------------------------------------
    S("cpi_bc", "statcan", "CPI all-items, BC (2002=100)", "M", "British Columbia",
      18100004, (26, 2), 41692462),
    S("cpi_van", "statcan", "CPI all-items, Vancouver (2002=100)", "M", "Vancouver",
      18100004, (27, 2), 41692930),
    S("cpi_ca", "statcan", "CPI all-items, Canada (2002=100)", "M", "Canada",
      18100004, (2, 2), 41690973),
    # --- Labour ---------------------------------------------------------------
    S("emp_bc", "statcan", "LFS employment 15+, BC, SA (thousands)", "M", "British Columbia",
      14100287, (11, 3, 1, 1, 1, 1), 2064701, statcan_adjusted=True),
    S("urate_bc", "statcan", "LFS unemployment rate 15+, BC, SA (%)", "M", "British Columbia",
      14100287, (11, 7, 1, 1, 1, 1), 2064705, statcan_adjusted=True),
    S("emp_ca", "statcan", "LFS employment 15+, Canada, SA (thousands)", "M", "Canada",
      14100287, (1, 3, 1, 1, 1, 1), 2062811, statcan_adjusted=True),
    S("awe_bc", "statcan", "SEPH average weekly earnings incl. overtime, industrial aggregate excl. unclassified, BC, SA ($)", "M",
      "British Columbia", 14100223, (11, 2, 2), 79311413, statcan_adjusted=True),
    # --- Output ---------------------------------------------------------------
    S("gdp_ca", "statcan", "Real GDP all industries, Canada, SAAR (chained 2017 $, millions)",
      "M", "Canada", 36100434, (1, 1, 1, 1), 65201210, statcan_adjusted=True),
    S("gdp_bc_annual", "statcan", "Real GDP all industries, BC, annual (chained 2017 $, millions)",
      "A", "British Columbia", 36100711, (10, 2, 1), 1793288710, seasonal_check=False),
    S("retail_bc", "statcan", "Retail sales, BC, SA ($ thousands)", "M", "British Columbia",
      20100056, (19, 1, 1, 2), 1446860064, statcan_adjusted=True),
    S("retail_van", "statcan", "Retail sales, Vancouver CMA, SA ($ thousands)", "M", "Vancouver",
      20100056, (20, 1, 1, 2), 1446860095, statcan_adjusted=True),
    S("mfg_bc", "statcan", "Manufacturing sales, BC, SA ($ thousands)", "M", "British Columbia",
      16100048, (10, 1, 2, 1), 807928, statcan_adjusted=True),
    # --- Population -----------------------------------------------------------
    S("pop_bc", "statcan", "Population estimate, BC (persons, quarterly)", "Q",
      "British Columbia", 17100009, (11,), 3, seasonal_check=False),
    S("pop_ca", "statcan", "Population estimate, Canada (persons, quarterly)", "Q", "Canada",
      17100009, (1,), 1, seasonal_check=False),
    # --- Housing --------------------------------------------------------------
    S("nhpi_van", "statcan", "New Housing Price Index, total, Vancouver (Dec 2016=100)", "M",
      "Vancouver", 18100205, (39, 1), 111955556),
    S("nhpi_bc", "statcan", "New Housing Price Index, total, BC (Dec 2016=100)", "M",
      "British Columbia", 18100205, (37, 1), 111955550),
    S("nhpi_ca", "statcan", "New Housing Price Index, total, Canada (Dec 2016=100)", "M",
      "Canada", 18100205, (1, 1), 111955442),
    S("starts_van", "statcan", "CMHC housing starts, total units, Vancouver CMA (units, NSA)",
      "M", "Vancouver", 34100154, (25, 1, 1), 42127505),
    S("permits_van", "statcan", "Building permits, total residential value, Vancouver CMA, SA ($ thousands)",
      "M", "Vancouver", 34100292, (59, 4, 1, 1, 2), 1675120030, statcan_adjusted=True),
    S("mortgage5y", "statcan", "CMHC conventional 5-year mortgage lending rate (%)", "M", "Canada",
      34100145, (1,), 733833, seasonal_check=False),
    # --- Bank of Canada -------------------------------------------------------
    S("policy_rate", "boc", "Target for the overnight rate (%, monthly mean)", "D",
      boc_name="V39079", seasonal_check=False),
    S("bank_rate", "boc", "Bank Rate (%, monthly; used only to extend the policy rate before 2009-04)",
      "D", boc_name="V122530", seasonal_check=False),
    S("gov5y", "boc", "GoC 5-year benchmark bond yield (%, monthly mean)", "D",
      boc_name="BD.CDN.5YR.DQ.YLD", seasonal_check=False),
    S("prime", "boc", "Prime rate (%, monthly mean)", "D", boc_name="V80691311",
      seasonal_check=False),
    S("cadusd", "boc", "CAD/USD (US$ per C$, inverted from FXUSDCAD, monthly mean)", "D",
      boc_name="FXUSDCAD", seasonal_check=False, invert=True),
]

BY_KEY = {s.key: s for s in SERIES}

# Core BVAR block (order = Cholesky ordering: slow-moving real variables first,
# then prices, then the policy rate, then the fast-moving housing price).
BVAR_VARS = ["pop_growth_bc", "gdp_bc", "emp_bc", "cpi_bc", "policy_rate", "nhpi_van"]

# Monthly indicators for the nowcasting factor model.
NOWCAST_VARS = ["emp_bc", "urate_bc", "awe_bc", "retail_bc", "mfg_bc",
                "starts_van", "permits_van", "gdp_ca"]
