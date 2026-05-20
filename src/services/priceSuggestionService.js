/**
 * US18 – Price Suggestion Service
 * 
 * Primary Source: eBay Finding API (real sold listings)
 * Fallback: Condition-based multipliers
 */

// ── eBay API Configuration ────────────────────────────────────────────────
const EBAY_APP_ID = import.meta.env.VITE_EBAY_APP_ID;

// eBay Finding API endpoint
const EBAY_FINDING_API = 'https://svcs.ebay.com/services/search/FindingService/v1';

// ── Category mapping for eBay ─────────────────────────────────────────────
const CATEGORY_EBAY_MAP = {
  electronics:     '293',
  books:           '267',
  clothing:        '11450',
  furniture:       '20494',
  appliance:       '20695',
  sports:          '888',
  outdoors:        '159043',
  accessories:     '33699',
  toys:            '220',
  beauty:          '31776',
  stationary:      '62103',
  study_materials: '2228',
  other:           '0',
};

// ── Condition mapping for eBay API ────────────────────────────────────────
const CONDITION_EBAY_MAP = {
  new:       '1000',
  like_new:  '1500',
  good:      '2000',
  fair:      '3000',
  poor:      '4000',
};

// ── Condition multipliers for fallback pricing ───────────────────────────
const CONDITION_MULTIPLIERS = {
  new:       1.00,   // 100% of baseline
  like_new:  0.80,   // 80% of baseline
  good:      0.60,   // 60% of baseline
  fair:      0.40,   // 40% of baseline
  poor:      0.25,   // 25% of baseline
};

// ── Baseline prices for fallback (ZAR) ───────────────────────────────────
const BASELINE_PRICES = {
  electronics:     { low: 500,  high: 3500 },
  books:           { low: 150,  high: 800 },
  clothing:        { low: 80,   high: 600 },
  furniture:       { low: 500,  high: 5000 },
  appliance:       { low: 300,  high: 4000 },
  sports:          { low: 100,  high: 1200 },
  outdoors:        { low: 100,  high: 1500 },
  accessories:     { low: 50,   high: 800 },
  toys:            { low: 50,   high: 600 },
  beauty:          { low: 50,   high: 400 },
  stationary:      { low: 20,   high: 300 },
  study_materials: { low: 100,  high: 900 },
  other:           { low: 50,   high: 800 },
};

// ── Helper: Get condition multiplier ──────────────────────────────────────
function getConditionMultiplier(condition) {
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? 0.60;
  console.log(`Condition: ${condition}, Multiplier: ${multiplier}`); // Debug log
  return multiplier;
}

// ── Fetch completed/sold item prices from eBay ────────────────────────────
async function fetchEbaySoldPrices(category, condition, limit = 15) {
  const ebayCategory = CATEGORY_EBAY_MAP[category] || '0';
  const ebayCondition = CONDITION_EBAY_MAP[condition] || '2000';
  
  console.log(`Fetching eBay: category=${category}(${ebayCategory}), condition=${condition}(${ebayCondition})`);
  
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.13.0',
    'SECURITY-APPNAME': EBAY_APP_ID,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    'categoryId': ebayCategory,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'Condition',
    'itemFilter(1).value': ebayCondition,
    'itemFilter(2).name': 'ListingType',
    'itemFilter(2).value': 'FixedPrice',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': limit,
  });
  
  try {
    const response = await fetch(`${EBAY_FINDING_API}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) throw new Error(`eBay API returned ${response.status}`);
    
    const data = await response.json();
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    
    if (!items.length) {
      console.log('No eBay items found');
      return null;
    }
    
    const prices = [];
    for (const item of items) {
      const price = item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
      const currency = item?.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'];
      
      if (price && parseFloat(price) > 0) {
        let zarPrice = parseFloat(price);
        if (currency === 'USD') zarPrice = zarPrice * 18.5;
        if (currency === 'GBP') zarPrice = zarPrice * 23;
        if (currency === 'EUR') zarPrice = zarPrice * 20;
        if (zarPrice > 0 && zarPrice < 100000) {
          prices.push(zarPrice);
        }
      }
    }
    
    if (prices.length < 3) {
      console.log(`Only ${prices.length} prices found, need at least 3`);
      return null;
    }
    
    // Remove outliers
    prices.sort((a, b) => a - b);
    const startIdx = Math.floor(prices.length * 0.1);
    const endIdx = Math.floor(prices.length * 0.9);
    const filteredPrices = prices.slice(startIdx, endIdx);
    
    const avg = filteredPrices.reduce((a, b) => a + b, 0) / filteredPrices.length;
    const multiplier = getConditionMultiplier(condition);
    const adjustedAvg = avg * multiplier;
    
    console.log(`eBay results: ${prices.length} items, avg=${Math.round(avg)}, adjusted=${Math.round(adjustedAvg)}`);
    
    return {
      suggestedLow: Math.max(10, Math.round(adjustedAvg * 0.7)),
      suggestedHigh: Math.round(adjustedAvg * 1.3),
      dataSource: `eBay (${prices.length} sold items, ${condition} condition)`,
      isLive: true,
      conditionMultiplier: multiplier,
    };
  } catch (error) {
    console.warn('eBay API fetch failed:', error.message);
    return null;
  }
}

// ── Fallback suggestion (condition-based) ─────────────────────────────────
function getFallbackSuggestion(category, condition) {
  const baseline = BASELINE_PRICES[category] ?? BASELINE_PRICES.other;
  const multiplier = getConditionMultiplier(condition);
  
  const suggestedLow = Math.max(10, Math.round(baseline.low * multiplier));
  const suggestedHigh = Math.max(suggestedLow + 10, Math.round(baseline.high * multiplier));
  
  console.log(`Fallback: category=${category}, condition=${condition}, multiplier=${multiplier}, range=${suggestedLow}-${suggestedHigh}`);
  
  return {
    suggestedLow,
    suggestedHigh,
    dataSource: `CampusMarket estimate (${condition} condition)`,
    isLive: false,
    conditionMultiplier: multiplier,
  };
}

// ── Main export ───────────────────────────────────────────────────────────
export async function getPriceSuggestion(category, condition = 'good') {
  // Require BOTH category AND condition
  if (!category || !condition) {
    console.log('Missing category or condition:', { category, condition });
    return null;
  }
  
  console.log(`getPriceSuggestion called with: category=${category}, condition=${condition}`);
  
  // Try eBay API first
  const ebayResult = await fetchEbaySoldPrices(category, condition);
  
  if (ebayResult) {
    return {
      ...ebayResult,
      category,
      condition,
    };
  }
  
  // Fallback to condition-based pricing
  return getFallbackSuggestion(category, condition);
}