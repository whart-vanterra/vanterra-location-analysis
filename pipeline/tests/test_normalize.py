import pytest
from pipeline.utils import normalize_city_key

def test_basic_normalization():
    assert normalize_city_key("Philadelphia", "PA") == "philadelphia|pa"

def test_strips_city_suffix():
    assert normalize_city_key("Virginia Beach city", "VA") == "virginia beach|va"

def test_strips_cdp_suffix():
    assert normalize_city_key("Linthicum Heights CDP", "MD") == "linthicum heights|md"

def test_strips_town_suffix():
    assert normalize_city_key("Cary town", "NC") == "cary|nc"

def test_normalizes_saint():
    assert normalize_city_key("St. Louis", "MO") == "saint louis|mo"
    assert normalize_city_key("Saint Louis", "MO") == "saint louis|mo"

def test_normalizes_fort():
    assert normalize_city_key("Ft. Worth", "TX") == "fort worth|tx"
    assert normalize_city_key("Fort Worth", "TX") == "fort worth|tx"

def test_normalizes_mount():
    assert normalize_city_key("Mt. Vernon", "NY") == "mount vernon|ny"
    assert normalize_city_key("Mount Vernon", "NY") == "mount vernon|ny"

def test_trims_whitespace():
    assert normalize_city_key("  Philadelphia  ", "  PA  ") == "philadelphia|pa"

def test_returns_display_name():
    key, display = normalize_city_key("St. Louis", "MO", return_display=True)
    assert key == "saint louis|mo"
    assert display == "St. Louis"
