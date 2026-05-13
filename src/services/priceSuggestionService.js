/**
 * US18 – SA Price Suggestion Service
 *
 * Data source: Stats SA Consumer Price Index (CPI), published monthly.
 * Reference: P0141 Statistical release — https://www.statssa.gov.za/
 */

/* ── Category value (matches CreateListing.jsx <option> values) ─── */
const CATEGORY_CPI_MAP = {
  electronics:     "Miscellaneous goods and services",
  books:           "Education",
  clothing:        "Clothing and footwear",
  furniture:       "Housing and utilities",
  appliance:       "Housing and utilities",
  sports:          "Recreation and culture",
  outdoors:        "Recreation and culture",
  accessories:     "Miscellaneous goods and services",
  toys:            "Recreation and culture",
  beauty:          "Miscellaneous goods and services",
  stationary:      "Education",
  study_materials: "Education",
  other:           "Miscellaneous goods and services",
};

/* ── Baseline price ranges (ZAR, 2023 base) and CPI at that base ── */
const BASELINE_PRICES = {
  electronics:     { low: 500,  high: 3500, baselineCPI: 119.4 },
  books:           { low: 150,  high: 800,  baselineCPI: 118.2 },
  clothing:        { low: 80,   high: 600,  baselineCPI: 121.7 },
  furniture:       { low: 500,  high: 5000, baselineCPI: 122.3 },
  appliance:       { low: 300,  high: 4000, baselineCPI: 122.3 },
  sports:          { low: 100,  high: 1200, baselineCPI: 117.8 },
  outdoors:        { low: 100,  high: 1500, baselineCPI: 117.8 },
  accessories:     { low: 50,   high: 800,  baselineCPI: 120.0 },
  toys:            { low: 50,   high: 600,  baselineCPI: 117.8 },
  beauty:          { low: 50,   high: 400,  baselineCPI: 120.0 },
  stationary:      { low: 20,   high: 300,  baselineCPI: 118.2 },
  study_materials: { low: 100,  high: 900,  baselineCPI: 118.2 },
  other:           { low: 50,   high: 800,  baselineCPI: 120.0 },
};

/* Fallback CPI when live fetch fails (Stats SA headline, Jan 2024) */
const FALLBACK_CPI = 127.8;

/* ── Fetch latest CPI from Stats SA open data portal ─────────────── */
async function fetchCurrentCPI() {
  try {
    const url =
      "https://opendata.statssa.gov.za/api/v1/sdmx-json/data/P0141/1.0/A/..././?detail=dataonly&startPeriod=2024&endPeriod=2025";

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Stats SA returned ${res.status}`);

    const json = await res.json();
    const series = Object.values(json?.dataSets?.[0]?.series ?? {});
    if (!series.length) throw new Error("No series in response");

    const observations = series[0]?.observations ?? {};
    const keys = Object.keys(observations).sort((a, b) => Number(a) - Number(b));
    const latestValue = observations[keys[keys.length - 1]]?.[0];

    if (!latestValue || isNaN(latestValue)) throw new Error("Invalid CPI value");

    return {
      value:  Number(latestValue),
      live:   true,
      source: "Stats SA P0141 (live)",
    };
  } catch {
    return {
      value:  FALLBACK_CPI,
      live:   false,
      source: "Stats SA P0141 (cached Jan 2024)",
    };
  }
}

/* ── Main export ──────────────────────────────────────────────────── */
export async function getPriceSuggestion(category) {
  const baseline  = BASELINE_PRICES[category] ?? BASELINE_PRICES["other"];
  const cpiResult = await fetchCurrentCPI();

  const factor       = cpiResult.value / baseline.baselineCPI;
  const suggestedLow  = Math.round(baseline.low  * factor);
  const suggestedHigh = Math.round(baseline.high * factor);

  return {
    category,
    cpiDivision:  CATEGORY_CPI_MAP[category] ?? "General",
    suggestedLow,
    suggestedHigh,
    currentCPI:   cpiResult.value,
    dataSource:   cpiResult.source,
    isLive:       cpiResult.live,
  };
}