import { useState, useEffect, useRef } from "react";
import { getPriceSuggestion } from "../services/priceSuggestionService";
import styles from "./PriceSuggestion.module.css";

export default function PriceSuggestion({ category, onSuggestionLoad }) {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const controllerRef               = useRef(null);

  useEffect(() => {
    if (!category) {
      setSuggestion(null);
      setError(null);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const load = async () => {
      setLoading(true);
      setError(null);
      setSuggestion(null);
      try {
        const result = await getPriceSuggestion(category);
        if (!controller.signal.aborted) {
          setSuggestion(result);
          onSuggestionLoad?.({ low: result.suggestedLow, high: result.suggestedHigh });
        }
      } catch {
        if (!controller.signal.aborted) {
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
  }, [category, onSuggestionLoad]);

  if (!category) return null;

  if (loading) {
    return (
      <div className={styles.widget}>
        <div className={styles.loadingRow}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>Fetching SA price data…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.widget} ${styles.errorWidget}`}>
        <span>⚠ {error}</span>
      </div>
    );
  }

  if (!suggestion) return null;

  const { suggestedLow, suggestedHigh, cpiDivision, dataSource, isLive } = suggestion;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.icon}>📊</span>
        <span className={styles.title}>SA Price Suggestion</span>
        <span className={`${styles.badge} ${isLive ? styles.live : styles.cached}`}>
          {isLive ? "Live" : "Cached"}
        </span>
      </div>

      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>Suggested range</span>
        <span className={styles.range}>
          R{suggestedLow.toLocaleString("en-ZA")} – R{suggestedHigh.toLocaleString("en-ZA")}
        </span>
      </div>

      <div className={styles.barWrapper} aria-hidden="true">
        <div className={styles.barSegment} />
        <div className={styles.barFill} />
        <div className={styles.barSegment} />
      </div>

      <p className={styles.footnote}>
        Based on <abbr title="Stats SA Consumer Price Index">CPI</abbr> division:{" "}
        <em>{cpiDivision}</em>. Source: {dataSource}.
      </p>
    </div>
  );
}