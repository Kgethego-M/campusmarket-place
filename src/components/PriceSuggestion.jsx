import { useState, useEffect, useRef } from "react";
import { getPriceSuggestion } from "../services/priceSuggestionService";
import styles from "./PriceSuggestion.module.css";

/**
 * US18 – Price Suggestion Component
 * 
 * Displays price suggestions from eBay real market data.
 * Falls back to Stats SA CPI data when eBay unavailable.
 * 
 * IMPORTANT: Suggestion ONLY shows when BOTH category AND condition are selected.
 * 
 * Props:
 * @param {string} category - Product category from CreateListing
 * @param {string} itemCondition - Product condition (new, like_new, good, fair, poor)
 * @param {function} onSuggestionLoad - Callback with price range
 */
export default function PriceSuggestion({ category, itemCondition, onSuggestionLoad }) {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const controllerRef               = useRef(null);

  useEffect(() => {
    // ── CRITICAL: Only show suggestion when BOTH are selected ──
    if (!category || !itemCondition) {
      setSuggestion(null);
      setError(null);
      return;
    }

    // Cancel previous request
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const load = async () => {
      setLoading(true);
      setError(null);
      setSuggestion(null);
      try {
        const result = await getPriceSuggestion(category, itemCondition);
        if (!controller.signal.aborted && result) {
          setSuggestion(result);
          onSuggestionLoad?.({ 
            low: result.suggestedLow, 
            high: result.suggestedHigh 
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Price suggestion error:", err);
          setError("Unable to load price suggestion.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => controller.abort();
  }, [category, itemCondition, onSuggestionLoad]);

  // ── Don't show anything if either category or condition is missing ──
  if (!category || !itemCondition) return null;

  // Loading state
  if (loading) {
    return (
      <div className={styles.widget}>
        <div className={styles.loadingRow}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>Fetching market prices from eBay...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${styles.widget} ${styles.errorWidget}`}>
        <i className="fas fa-exclamation-circle" style={{ marginRight: "6px" }} />
        <span>{error}</span>
      </div>
    );
  }

  // No data yet
  if (!suggestion) return null;

  const { suggestedLow, suggestedHigh, dataSource, isLive, condition, conditionMultiplier } = suggestion;

  // Format condition for display
  const conditionDisplay = {
    new: "New",
    like_new: "Like New",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
  }[itemCondition] || itemCondition;

  // Calculate suggested mid price
  const suggestedMid = Math.round((suggestedLow + suggestedHigh) / 2);

  return (
    <div className={styles.widget}>
      {/* Header */}
      <div className={styles.header}>
        <i className="fas fa-chart-line" style={{ fontSize: "14px" }} />
        <span className={styles.title}>Price Suggestion</span>
        <span className={`${styles.badge} ${isLive ? styles.live : styles.cached}`}>
          {isLive ? "eBay Market" : "Estimate"}
        </span>
      </div>

      {/* Condition info - shows the condition used for pricing */}
      <div className={styles.conditionRow}>
        <span className={styles.conditionLabel}>
          <i className="fas fa-clipboard-list" style={{ fontSize: "10px", marginRight: "4px" }} />
          Condition
        </span>
        <span className={styles.conditionValue}>{conditionDisplay}</span>
        {conditionMultiplier && (
          <span className={styles.multiplierHint}>
            ({Math.round(conditionMultiplier * 100)}% of baseline)
          </span>
        )}
      </div>

      {/* Price range */}
      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>
          <i className="fas fa-tag" style={{ fontSize: "10px", marginRight: "4px" }} />
          Suggested range
        </span>
        <span className={styles.range}>
          R{suggestedLow.toLocaleString("en-ZA")} – R{suggestedHigh.toLocaleString("en-ZA")}
        </span>
      </div>

      {/* Suggested mid price */}
      <div className={styles.midPriceRow}>
        <span className={styles.midPriceLabel}>
          <i className="fas fa-calculator" style={{ fontSize: "10px", marginRight: "4px" }} />
          Suggested price
        </span>
        <span className={styles.midPrice}>
          R{suggestedMid.toLocaleString("en-ZA")}
        </span>
      </div>

      {/* Visual bar */}
      <div className={styles.barWrapper} aria-hidden="true">
        <div className={styles.barSegment} />
        <div className={styles.barFill} style={{ width: `${(suggestedMid / suggestedHigh) * 100}%` }} />
        <div className={styles.barSegment} />
      </div>

      {/* Data source footnote */}
      <p className={styles.footnote}>
        <i className="fas fa-info-circle" style={{ fontSize: "10px", marginRight: "4px" }} />
        {dataSource}
      </p>
    </div>
  );
}