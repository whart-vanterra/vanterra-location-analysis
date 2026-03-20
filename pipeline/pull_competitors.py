"""Pull competitor locations from Google Maps Places API.

Searches for foundation repair / basement waterproofing companies
near each recommendation and existing office city. Outputs a JSON
file with competitor name, lat/lng, rating, and address.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
SEARCH_QUERIES = [
    "foundation repair",
    "basement waterproofing",
    "crawl space repair",
]
RADIUS_METERS = 32187  # 20 miles
MAX_RESULTS_PER_CITY = 20
OUTPUT_PATH = Path(__file__).parent.parent / "app" / "src" / "data" / "competitors.json"


def places_nearby(lat: float, lng: float, query: str) -> list[dict]:
    """Search Google Places Nearby for a query near a location."""
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json?" + urllib.parse.urlencode({
        "query": query,
        "location": f"{lat},{lng}",
        "radius": RADIUS_METERS,
        "key": API_KEY,
    })
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            print(f"  API warning: {data.get('status')} - {data.get('error_message', '')}", file=sys.stderr)
            return []
        return data.get("results", [])
    except Exception as e:
        print(f"  API error: {e}", file=sys.stderr)
        return []


def dedupe_competitors(competitors: list[dict]) -> list[dict]:
    """Deduplicate by place_id."""
    seen = set()
    result = []
    for c in competitors:
        pid = c.get("place_id", "")
        if pid and pid not in seen:
            seen.add(pid)
            result.append(c)
    return result


def main():
    if not API_KEY:
        print("Error: GOOGLE_MAPS_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    recs_path = Path(__file__).parent.parent / "app" / "src" / "data" / "recommendations.json"
    brands_path = Path(__file__).parent.parent / "app" / "src" / "data" / "brands.json"

    recs = json.loads(recs_path.read_text())
    brands = json.loads(brands_path.read_text())

    # Collect unique cities
    cities: dict[str, dict] = {}
    for brand_recs in recs.values():
        for r in brand_recs[:10]:
            key = r["city_key"]
            if key not in cities:
                parts = key.split("|")
                city_name = r.get("city") or parts[0].replace("-", " ").title()
                state = r.get("state") or (parts[1].upper() if len(parts) > 1 else "")
                cities[key] = {"city": city_name, "state": state, "lat": r["lat"], "lng": r["lng"]}

    for b in brands:
        for loc in b["existing_locations"]:
            key = loc["city_key"]
            if key not in cities:
                cities[key] = {"city": loc["city"], "state": loc["state"], "lat": loc["lat"], "lng": loc["lng"]}

    print(f"Pulling competitors for {len(cities)} cities...")
    print(f"Queries per city: {len(SEARCH_QUERIES)}")
    print(f"Estimated API calls: {len(cities) * len(SEARCH_QUERIES)}")

    # Load existing results to resume
    existing: dict = {}
    if OUTPUT_PATH.exists():
        existing = json.loads(OUTPUT_PATH.read_text())
        print(f"Resuming: {len(existing)} cities already done")

    results: dict[str, dict] = dict(existing)
    api_calls = 0

    for i, (city_key, info) in enumerate(cities.items()):
        if city_key in results:
            continue

        print(f"[{i+1}/{len(cities)}] {info['city']}, {info['state']}...")
        all_places: list[dict] = []

        for query in SEARCH_QUERIES:
            raw = places_nearby(info["lat"], info["lng"], query)
            api_calls += 1

            for place in raw:
                loc = place.get("geometry", {}).get("location", {})
                all_places.append({
                    "place_id": place.get("place_id", ""),
                    "name": place.get("name", ""),
                    "lat": loc.get("lat"),
                    "lng": loc.get("lng"),
                    "rating": place.get("rating"),
                    "user_ratings_total": place.get("user_ratings_total", 0),
                    "address": place.get("formatted_address", ""),
                    "types": place.get("types", []),
                    "business_status": place.get("business_status", ""),
                })

            # Rate limit: 10 QPS max for Places API
            time.sleep(0.15)

        deduped = dedupe_competitors(all_places)
        # Sort by rating count descending
        deduped.sort(key=lambda x: x.get("user_ratings_total", 0), reverse=True)
        deduped = deduped[:MAX_RESULTS_PER_CITY]

        results[city_key] = {
            "city": info["city"],
            "state": info["state"],
            "lat": info["lat"],
            "lng": info["lng"],
            "competitor_count": len(deduped),
            "competitors": deduped,
        }

        # Save incrementally every 10 cities
        if (i + 1) % 10 == 0:
            OUTPUT_PATH.write_text(json.dumps(results, indent=2))
            print(f"  Saved {len(results)} cities ({api_calls} API calls so far)")

    # Final save
    OUTPUT_PATH.write_text(json.dumps(results, indent=2))
    print(f"\nDone! {len(results)} cities, {api_calls} API calls")
    print(f"Output: {OUTPUT_PATH}")

    # Summary stats
    total_competitors = sum(r["competitor_count"] for r in results.values())
    avg = total_competitors / len(results) if results else 0
    print(f"Total competitors found: {total_competitors}")
    print(f"Average per city: {avg:.1f}")


if __name__ == "__main__":
    main()
