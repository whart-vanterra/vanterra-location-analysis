import os
import re
from dotenv import load_dotenv
from supabase import create_client


def get_supabase():
    """Initialize Supabase client from .env.local."""
    load_dotenv(".env.local")
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def normalize_city_key(city: str, state: str, return_display: bool = False):
    """
    Normalize city/state into a canonical city_key.
    Returns city_key string, or (city_key, display_name) if return_display=True.
    """
    display = city.strip()
    city_clean = display.lower()
    state_clean = state.strip().lower()

    # Strip suffixes
    city_clean = re.sub(r'\s+(city|town|cdp)$', '', city_clean)

    # Normalize abbreviations
    city_clean = re.sub(r'\bst\.?\s', 'saint ', city_clean)
    city_clean = re.sub(r'\bft\.?\s', 'fort ', city_clean)
    city_clean = re.sub(r'\bmt\.?\s', 'mount ', city_clean)

    key = f"{city_clean.strip()}|{state_clean.strip()}"

    if return_display:
        return key, display
    return key
