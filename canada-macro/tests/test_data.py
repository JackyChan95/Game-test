"""Data layer: cache idempotency, parsing, verification, alignment."""
import numpy as np
import pandas as pd
import pytest

from macro.data import cache
from macro.data.build import quarterly_to_monthly, seasonal_adjust
from macro.data.registry import BY_KEY, SERIES
from macro.data.sources import VerificationError, parse_boc, parse_statcan, verify


def test_cache_is_idempotent(tmp_path):
    cache.save(tmp_path, "x", {"a": 1})
    cache.save(tmp_path, "x", {"a": 1})          # identical -> no new file
    assert len(list(tmp_path.glob("x__*.json"))) == 1
    cache.save(tmp_path, "x", {"a": 2})          # changed -> new timestamped file
    assert len(list(tmp_path.glob("x__*.json"))) == 2
    assert cache.load_latest(tmp_path, "x") == {"a": 2}


def test_get_or_fetch_uses_cache_unless_refresh(tmp_path):
    calls = []
    fetch = lambda: calls.append(1) or {"v": len(calls)}  # noqa: E731
    assert cache.get_or_fetch(tmp_path, "y", fetch, refresh=False) == {"v": 1}
    assert cache.get_or_fetch(tmp_path, "y", fetch, refresh=False) == {"v": 1}
    assert len(calls) == 1
    cache.get_or_fetch(tmp_path, "y", fetch, refresh=True)
    assert len(calls) == 2


def test_parse_statcan_handles_missing_values():
    payload = [{"status": "SUCCESS", "object": {"vectorDataPoint": [
        {"refPer": "2024-02-01", "value": 2.0}, {"refPer": "2024-01-01", "value": None}]}}]
    s = parse_statcan(payload)
    assert list(s.index) == [pd.Timestamp("2024-01-01"), pd.Timestamp("2024-02-01")]
    assert np.isnan(s.iloc[0]) and s.iloc[1] == 2.0


def test_parse_boc():
    payload = {"observations": [{"d": "2024-01-02", "FX": {"v": "1.25"}}, {"d": "2024-01-03", "FX": {"v": ""}}]}
    s = parse_boc(payload, "FX")
    assert s.iloc[0] == 1.25 and np.isnan(s.iloc[1])


def _info(s, vector, title):
    return {"status": "SUCCESS", "object": {"productId": s.pid, "coordinate": s.coordinate,
            "vectorId": vector, "SeriesTitleEn": title, "memberUomCode": 1, "scalarFactorCode": 0}}


CODES = {"object": {"uom": [{"memberUomCode": 1, "memberUomEn": "Index"}],
                    "scalar": [{"scalarFactorCode": 0, "scalarFactorDescEn": "units"}]}}


def test_verify_matches_out_of_order_responses():
    a, b = BY_KEY["cpi_bc"], BY_KEY["nhpi_van"]
    info = [_info(b, b.expected_vector, "Vancouver, British Columbia;Total"),
            _info(a, a.expected_vector, "British Columbia;All-items")]
    meta = verify([a, b], info, CODES)
    assert list(meta["key"]) == ["cpi_bc", "nhpi_van"]


def test_verify_rejects_wrong_vector_or_geography():
    a = BY_KEY["cpi_bc"]
    with pytest.raises(VerificationError):
        verify([a], [_info(a, 123, "British Columbia;All-items")], CODES)
    with pytest.raises(VerificationError):
        verify([a], [_info(a, a.expected_vector, "Alberta;All-items")], CODES)


def test_registry_coordinates_are_ten_members():
    for s in SERIES:
        if s.source == "statcan":
            assert len(s.coordinate.split(".")) == 10


def test_quarterly_interpolation_hits_quarter_values():
    q = pd.Series([100.0, 103.0, 104.0, 108.0],
                  index=pd.to_datetime(["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01"]))
    m = quarterly_to_monthly(q)
    assert len(m) == 10
    assert np.allclose(m.loc[q.index], q.values)
    assert (np.diff(m.values) > 0).all()        # PCHIP preserves monotonicity


def test_seasonal_adjust_only_when_seasonal():
    idx = pd.date_range("2005-01-01", periods=180, freq="MS")
    rng = np.random.default_rng(0)
    trend = np.exp(np.linspace(0, 0.3, 180))
    seasonal = trend * (1 + 0.05 * np.sin(2 * np.pi * idx.month / 12)) * np.exp(rng.normal(0, 0.002, 180))
    adj, done, p = seasonal_adjust(pd.Series(seasonal, idx))
    assert done and p < 0.01
    # Adjusted series has much smaller month-of-year pattern in its changes.
    d = np.log(adj).diff().groupby(idx.month).mean()
    assert d.std() < 0.2 * np.log(pd.Series(seasonal, idx)).diff().groupby(idx.month).mean().std()
    plain = pd.Series(trend * np.exp(rng.normal(0, 0.01, 180)), idx)
    _, done2, _ = seasonal_adjust(plain)
    assert not done2
