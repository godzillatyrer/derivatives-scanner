"use client";

import { useEffect, useRef, useState } from "react";

const SIGNAL_COLORS = {
  long: "badge badge-long",
  short: "badge badge-short",
  neutral: "badge badge-neutral"
};

// default refresh every 20 seconds
const DEFAULT_REFRESH_MS = 20000;

export default function HomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("both"); // both | 4h | 1d
  const [signalFilter, setSignalFilter] = useState("all"); // all | long | short
  const [error, setError] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [detailTf, setDetailTf] = useState("4h"); // which TF to show in detail panel
  const [refreshMs, setRefreshMs] = useState(DEFAULT_REFRESH_MS);
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  // memory of previous signals so we can detect NEW long/short
  const prevSignalsRef = useRef({});

  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 150);
    } catch (e) {
      console.warn("Audio beep failed", e);
    }
  }

  function maybeNotify(changes) {
    if (!changes.length) return;

    // sound
    playBeep();

    // desktop notifications (if allowed)
    if (!alertsEnabled) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    changes.slice(0, 3).forEach((c) => {
      new Notification(`New ${c.dir.toUpperCase()} signal`, {
        body: `${c.symbol} · ${c.tf}`,
        tag: `${c.symbol}-${c.tf}-${c.dir}`
      });
    });
  }

  function detectSignalChanges(prevMap, symbols, suppressAlerts = false) {
    if (suppressAlerts) {
      // just update ref without making noise
      const nextMap = {};
      symbols.forEach((s) => {
        nextMap[s.symbol] = {
          "4h": s.signals["4h"].direction,
          "1d": s.signals["1d"].direction
        };
      });
      prevSignalsRef.current = nextMap;
      return;
    }

    const changes = [];
    const nextMap = {};

    symbols.forEach((s) => {
      const curr4 = s.signals["4h"].direction;
      const curr1 = s.signals["1d"].direction;
      const prev = prevMap[s.symbol];

      if (!prev) {
        // first time we see this symbol – consider long/short as "new"
        if (curr4 === "long" || curr4 === "short") {
          changes.push({ symbol: s.symbol, tf: "4H", dir: curr4 });
        }
        if (curr1 === "long" || curr1 === "short") {
          changes.push({ symbol: s.symbol, tf: "1D", dir: curr1 });
        }
      } else {
        if (
          prev["4h"] !== curr4 &&
          (curr4 === "long" || curr4 === "short")
        ) {
          changes.push({ symbol: s.symbol, tf: "4H", dir: curr4 });
        }
        if (
          prev["1d"] !== curr1 &&
          (curr1 === "long" || curr1 === "short")
        ) {
          changes.push({ symbol: s.symbol, tf: "1D", dir: curr1 });
        }
      }

      nextMap[s.symbol] = { "4h": curr4, "1d": curr1 };
    });

    prevSignalsRef.current = nextMap;
    if (changes.length) {
      maybeNotify(changes);
    }
  }

  async function loadSignals(options = { suppressAlerts: false }) {
    try {
      const { suppressAlerts } = options;
      setError(null);

      const res = await fetch("/api/signals");
      let json = null;

      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!res.ok || !json) {
        const msg =
          json?.details ||
          json?.error ||
          `Failed to load signals (HTTP ${res.status} ${res.statusText})`;
        throw new Error(msg);
      }

      setData(json);

      if (json.symbols && json.symbols.length) {
        detectSignalChanges(
          prevSignalsRef.current,
          json.symbols,
          suppressAlerts
        );

        // if nothing selected yet, select the first symbol
        if (!selectedSymbol) {
          setSelectedSymbol(json.symbols[0]);
        } else {
          // keep selected object in sync with latest data
          const updated = json.symbols.find(
            (s) => s.symbol === selectedSymbol.symbol
          );
          if (updated) setSelectedSymbol(updated);
        }
      }
    } catch (e) {
      console.error(e);
      setError(
        e?.message || "Could not load data. Try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  }

  // initial load – do NOT trigger alerts yet
  useEffect(() => {
    loadSignals({ suppressAlerts: true });
  }, []);

  // auto-refresh according to refreshMs
  useEffect(() => {
    const id = setInterval(() => {
      loadSignals({ suppressAlerts: false });
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, selectedSymbol]); // selectedSymbol used inside loadSignals

  const symbols = data?.symbols || [];

  // always sort by highest volume first (extra safety on top of backend sort)
  const sortedSymbols = [...symbols].sort((a, b) => b.volume - a.volume);

  const filteredSymbols = sortedSymbols.filter((s) => {
    const sig4h = s.signals["4h"].direction;
    const sig1d = s.signals["1d"].direction;

    let effectiveSignal = "neutral";

    if (timeframe === "4h") {
      effectiveSignal = sig4h;
    } else if (timeframe === "1d") {
      effectiveSignal = sig1d;
    } else {
      effectiveSignal =
        sig4h === "long" || sig4h === "short" ? sig4h : sig1d;
    }

    if (signalFilter === "all") return true;
    if (signalFilter === "long") return effectiveSignal === "long";
    if (signalFilter === "short") return effectiveSignal === "short";
    return true;
  });

  function handleEnableAlerts() {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        setAlertsEnabled(true);
      } else {
        setAlertsEnabled(false);
      }
    });
  }

  // helper for TradingView symbol
  function getTradingViewSymbol(sym) {
    return `BINANCE:${sym}`;
  }

  return (
    <div className="app-container">
      <div className="card">
        <h1>Derivatives Volume Scanner</h1>
        <p className="small">
          Source: Binance USDT-M Futures · Timeframes: 4H &amp; 1D · Signals
          are rule-based and for information only, not financial advice.
        </p>

        <div className="controls">
          {/* Timeframe filter */}
          <span className="small">Timeframe filter:</span>
          <button
            className={timeframe === "both" ? "active" : ""}
            onClick={() => setTimeframe("both")}
          >
            Both
          </button>
          <button
            className={timeframe === "4h" ? "active" : ""}
            onClick={() => setTimeframe("4h")}
          >
            4H
          </button>
          <button
            className={timeframe === "1d" ? "active" : ""}
            onClick={() => setTimeframe("1d")}
          >
            1D
          </button>

          {/* Signal filter */}
          <span className="small" style={{ marginLeft: 12 }}>
            Signal:
          </span>
          <button
            className={signalFilter === "all" ? "active" : ""}
            onClick={() => setSignalFilter("all")}
          >
            All
          </button>
          <button
            className={signalFilter === "long" ? "active" : ""}
            onClick={() => setSignalFilter("long")}
          >
            Long only
          </button>
          <button
            className={signalFilter === "short" ? "active" : ""}
            onClick={() => setSignalFilter("short")}
          >
            Short only
          </button>

          {/* Refresh control */}
          <span className="small" style={{ marginLeft: 12 }}>
            Auto-refresh:
          </span>
          <select
            value={refreshMs}
            onChange={(e) => setRefreshMs(Number(e.target.value))}
          >
            <option value={10000}>10s</option>
            <option value={20000}>20s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
          </select>

          {/* Right-side buttons */}
          <button
            style={{ marginLeft: "auto" }}
            onClick={() => loadSignals({ suppressAlerts: false })}
          >
            Refresh now
          </button>

          <button
            onClick={handleEnableAlerts}
            style={{
              borderColor: alertsEnabled ? "#22c55e" : undefined,
              color: alertsEnabled ? "#bbf7d0" : undefined
            }}
          >
            {alertsEnabled ? "Alerts enabled" : "Enable alerts"}
          </button>
        </div>

        {loading && <p>Loading signals from Binance...</p>}
        {error && (
          <p style={{ color: "#f97373" }}>
            {error}
          </p>
        )}

        <p className="small-muted">
          Auto-refresh every {Math.round(refreshMs / 1000)} seconds. 4H/1D
          signals don&apos;t need ultra-fast updates, but you can lower it if
          you want more frequent checks.
        </p>

        <div className="main-layout">
          {/* LEFT: TABLE */}
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Last</th>
                  <th>24h %</th>
                  <th>Volume (quote)</th>
                  <th>4H</th>
                  <th>1D</th>
                </tr>
              </thead>
              <tbody>
                {filteredSymbols.map((s) => {
                  const sig4h = s.signals["4h"];
                  const sig1d = s.signals["1d"];
                  const isSelected =
                    selectedSymbol && selectedSymbol.symbol === s.symbol;

                  return (
                    <tr
                      key={s.symbol}
                      className={isSelected ? "selected-row" : ""}
                      onClick={() => setSelectedSymbol(s)}
                    >
                      <td>{s.symbol}</td>
                      <td>{s.lastPrice.toFixed(4)}</td>
                      <td
                        style={{
                          color:
                            s.priceChangePercent > 0
                              ? "#22c55e"
                              : s.priceChangePercent < 0
                              ? "#f97373"
                              : "#e5e7eb"
                        }}
                      >
                        {s.priceChangePercent.toFixed(2)}%
                      </td>
                      <td>{s.volume.toFixed(0)}</td>
                      <td>
                        <span className={SIGNAL_COLORS[sig4h.direction]}>
                          {sig4h.direction.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={SIGNAL_COLORS[sig1d.direction]}>
                          {sig1d.direction.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!filteredSymbols.length && !loading && (
                  <tr>
                    <td colSpan={6}>No symbols match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* RIGHT: DETAILS PANEL */}
          <div className="detail-card">
            {selectedSymbol ? (
              <>
                <div className="detail-header">
                  <div>
                    <div className="detail-symbol">
                      {selectedSymbol.symbol}
                    </div>
                    <div className="detail-price small-muted">
                      Last price:{" "}
                      {selectedSymbol.lastPrice.toFixed(4)} · 24h change:{" "}
                      <span
                        style={{
                          color:
                            selectedSymbol.priceChangePercent > 0
                              ? "#22c55e"
                              : selectedSymbol.priceChangePercent < 0
                              ? "#f97373"
                              : "#e5e7eb"
                        }}
                      >
                        {selectedSymbol.priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="detail-tabs">
                    <button
                      className={
                        "detail-tab" + (detailTf === "4h" ? " active" : "")
                      }
                      onClick={() => setDetailTf("4h")}
                    >
                      4H
                    </button>
                    <button
                      className={
                        "detail-tab" + (detailTf === "1d" ? " active" : "")
                      }
                      onClick={() => setDetailTf("1d")}
                    >
                      1D
                    </button>
                  </div>
                </div>

                {/* TradingView chart embed */}
                <iframe
                  key={`${selectedSymbol.symbol}-${detailTf}`}
                  className="chart-frame"
                  title={`${selectedSymbol.symbol} chart`}
                  src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                    getTradingViewSymbol(selectedSymbol.symbol)
                  )}&interval=${
                    detailTf === "4h" ? "240" : "D"
                  }&hidesidetoolbar=1&symboledit=1&saveimage=0&theme=dark&style=1&timezone=Etc%2FUTC&hideideas=1&studies=`}
                  allowFullScreen
                />

                <div className="reason">
                  {selectedSymbol.signals[detailTf].reason
                    .split("\n")
                    .map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                </div>
              </>
            ) : (
              <p className="small-muted">
                Click on a symbol in the table to see its chart and reasoning.
              </p>
            )}
          </div>
        </div>

        {data && (
          <p className="small" style={{ marginTop: 10 }}>
            Updated at: {new Date(data.updatedAt).toLocaleString()} · Showing{" "}
            {filteredSymbols.length} of {data.count} pairs
          </p>
        )}
      </div>
    </div>
  );
}
