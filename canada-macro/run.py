"""Command-line entry point.

    python run.py --refresh --forecast 12      # download fresh data, 12-month forecasts
    python run.py --forecast 24                # reuse cached data, 24-month forecasts
    python run.py --no-backtest                # skip the (slower) backtests
"""
import argparse
import sys
import time
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from macro import pipeline  # noqa: E402
from macro.data.sources import VerificationError  # noqa: E402
from macro.reports.html import render  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="BC / Vancouver macro-econometric model")
    ap.add_argument("--refresh", action="store_true",
                    help="re-download all series (otherwise use the newest cache, fetching only if missing)")
    ap.add_argument("--forecast", type=int, default=12, choices=range(1, 37), metavar="MONTHS",
                    help="forecast horizon in months (default 12, max 36)")
    ap.add_argument("--no-backtest", action="store_true", help="skip out-of-sample backtests")
    ap.add_argument("--out", default=str(ROOT / "output" / "report.html"), help="HTML report path")
    args = ap.parse_args(argv)

    warnings.filterwarnings("ignore")          # statsmodels convergence chatter
    t0 = time.time()
    try:
        results = pipeline.run(args.refresh, args.forecast, do_backtest=not args.no_backtest)
    except VerificationError as e:
        print(f"\nSTOPPED: {e}\nCheck the table metadata and update macro/data/registry.py "
              "(do not substitute a different series without review).")
        return 2
    print("[6/6] Report")
    path = render(results, Path(args.out))
    print(f"  wrote {path}  ({time.time() - t0:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
