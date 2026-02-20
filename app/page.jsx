"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCandles, fetchMarketUniverse } from "@/lib/hyperliquid";
import {
  calcATR,
  calcBollinger,
  calcEMA,
  calcMACD,
  calcRSI,
  calcStochastic,
  generateSignal
} from "@/lib/indicators";

const LEARNING_KEY = "hl-learning-v2";
const REFRESH_MS = 15000;

const signalClass = {
  long: "pill pill-long",
  short: "pill pill-short",
  neutral: "pill pill-neutral"
};

function defaultLearning() {
  return { wins: 0, losses: 0, rr: 1.8, slAtr: 1.4 };
}

function loadLearning() {
  if (typeof window === "undefined") return defaultLearning();
  try {
    const value = window.localStorage.getItem(LEARNING_KEY);
    return value ? JSON.parse(value) : defaultLearning();
  } catch {
    return defaultLearning();
  }
}

function persistLearning(next) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LEARNING_KEY, JSON.stringify(next));
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const outputs = [];
  const queue = [];

  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item));
    outputs.push(task);

    if (limit <= items.length) {
      const p = task.then(() => queue.splice(queue.indexOf(p), 1));
      queue.push(p);
      if (queue.length >= limit) await Promise.race(queue);
    }
  }

  return Promise.all(outputs);
}

async function buildDashboard(tuning) {
  const marketRows = await fetchMarketUniverse();

  const rows = [];

  await mapWithConcurrency(marketRows, 10, async (coin) => {
    try {
      const [candles4h, candles1d] = await Promise.all([
        fetchCandles(coin.symbol, "4h", 1000 * 60 * 60 * 24 * 80),
        fetchCandles(coin.symbol, "1d", 1000 * 60 * 60 * 24 * 260)
      ]);

      const compute = (candles, tf) =>
        generateSignal({
          tf,
          tuning,
          price: coin.price,
          ema20: calcEMA(candles.closes, 20),
          ema50: calcEMA(candles.closes, 50),
          ema200: calcEMA(candles.closes, 200),
          rsi: calcRSI(candles.closes, 14),
          macd: calcMACD(candles.closes),
          atr: calcATR(candles.highs, candles.lows, candles.closes, 14),
          stoch: calcStochastic(candles.highs, candles.lows, candles.closes, 14),
          bollinger: calcBollinger(candles.closes, 20, 2)
        });

      const signal4h = compute(candles4h, "4H");
      const signal1d = compute(candles1d, "1D");

      const primary =
        Math.abs(signal4h.score) >= Math.abs(signal1d.score) ? signal4h : signal1d;

      rows.push({
        ...coin,
        signals: {
          "4h": signal4h,
          "1d": signal1d,
          primary
        }
      });
    } catch (error) {
      console.error("coin scan failed", coin.symbol, error);
    }
  });

  rows.sort((a, b) => b.volume - a.volume);

  const directional = rows.filter((row) => row.signals.primary.direction !== "neutral");
  const longs = directional.filter((row) => row.signals.primary.direction === "long").length;
  const shorts = directional.filter((row) => row.signals.primary.direction === "short").length;

  return {
    updatedAt: new Date().toISOString(),
    rows,
    totals: {
      coins: rows.length,
      directional: directional.length,
      longs,
      shorts
    }
  };
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("all");
  const [activeSymbol, setActiveSymbol] = useState(null);
  const [activeTf, setActiveTf] = useState("4h");
  const [panel, setPanel] = useState("scanner");
  const [learning, setLearning] = useState(defaultLearning());

  const scan = async () => {
    try {
      setError(null);
      const next = await buildDashboard(learning);
      setDashboard(next);

      if (!activeSymbol && next.rows.length) {
        setActiveSymbol(next.rows[0]);
      } else if (activeSymbol) {
        const updated = next.rows.find((r) => r.symbol === activeSymbol.symbol);
        if (updated) setActiveSymbol(updated);
      }
    } catch (e) {
      setError(e?.message || "Failed to scan Hyperliquid");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLearning(loadLearning());
  }, []);

  useEffect(() => {
    scan();
    const id = setInterval(scan, REFRESH_MS);
    return () => clearInterval(id);
  }, [learning.rr, learning.slAtr]);

  const rows = dashboard?.rows || [];

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matches = row.symbol.toLowerCase().includes(search.toLowerCase());
      if (!matches) return false;
      if (mode === "all") return true;
      return row.signals.primary.direction === mode;
    });
  }, [rows, search, mode]);

  const signalCards = [...filteredRows]
    .filter((row) => row.signals.primary.direction !== "neutral")
    .sort((a, b) => b.signals.primary.confidence - a.signals.primary.confidence);

  function markResult(won) {
    const next = {
      ...learning,
      wins: learning.wins + (won ? 1 : 0),
      losses: learning.losses + (won ? 0 : 1)
    };

    const total = next.wins + next.losses;
    const winRate = total === 0 ? 0.5 : next.wins / total;

    next.rr = Math.min(3.2, Math.max(1.2, 1.2 + winRate * 2));
    next.slAtr = Math.min(2.2, Math.max(1.0, 1.9 - winRate * 0.9));

    setLearning(next);
    persistLearning(next);
  }

  const totalOutcomes = learning.wins + learning.losses;
  const winRate = totalOutcomes ? (learning.wins / totalOutcomes) * 100 : 0;

  return (
    <main className="page">
      <header className="hero">
        <div>
          <h1>Hyperliquid Signal Terminal</h1>
          <p>
            All-coin scanner with multi-indicator long/short signals, TP/SL plans, and a
            self-tuning risk profile from previous outcomes.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={scan}>Refresh</button>
          <button className={panel === "scanner" ? "active" : ""} onClick={() => setPanel("scanner")}>Scanner</button>
          <button className={panel === "signals" ? "active" : ""} onClick={() => setPanel("signals")}>Signals</button>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat"><span>Coins tracked</span><strong>{dashboard?.totals.coins ?? 0}</strong></article>
        <article className="stat"><span>Directional setups</span><strong>{dashboard?.totals.directional ?? 0}</strong></article>
        <article className="stat"><span>Long / Short</span><strong>{dashboard ? `${dashboard.totals.longs} / ${dashboard.totals.shorts}` : "0 / 0"}</strong></article>
        <article className="stat"><span>Win rate</span><strong>{winRate.toFixed(1)}%</strong></article>
        <article className="stat"><span>Adaptive RR</span><strong>{learning.rr.toFixed(2)}</strong></article>
        <article className="stat"><span>Adaptive SL ATR</span><strong>{learning.slAtr.toFixed(2)}x</strong></article>
      </section>

      <section className="controls">
        <input placeholder="Search coin" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="all">All directions</option>
          <option value="long">Long only</option>
          <option value="short">Short only</option>
        </select>
        <span className="muted">Auto-refresh: {REFRESH_MS / 1000}s</span>
      </section>

      {loading && <p className="muted">Loading market scan...</p>}
      {error && <p className="error">{error}</p>}

      {panel === "scanner" ? (
        <section className="layout">
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Price</th>
                  <th>24h</th>
                  <th>Volume</th>
                  <th>Funding</th>
                  <th>4H</th>
                  <th>1D</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.symbol}
                    className={activeSymbol?.symbol === row.symbol ? "active-row" : ""}
                    onClick={() => setActiveSymbol(row)}
                  >
                    <td>{row.symbol}</td>
                    <td>{row.price.toFixed(4)}</td>
                    <td className={row.priceChangePercent >= 0 ? "up" : "down"}>{row.priceChangePercent.toFixed(2)}%</td>
                    <td>{row.volume.toFixed(0)}</td>
                    <td>{(row.funding * 100).toFixed(4)}%</td>
                    <td><span className={signalClass[row.signals["4h"].direction]}>{row.signals["4h"].direction}</span></td>
                    <td><span className={signalClass[row.signals["1d"].direction]}>{row.signals["1d"].direction}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="detail-card">
            {activeSymbol ? (
              <>
                <div className="detail-top">
                  <div>
                    <h2>{activeSymbol.symbol}</h2>
                    <p className="muted">
                      ${activeSymbol.price.toFixed(4)} · {activeSymbol.priceChangePercent.toFixed(2)}%
                    </p>
                  </div>
                  <div className="tf-buttons">
                    <button className={activeTf === "4h" ? "active" : ""} onClick={() => setActiveTf("4h")}>4H</button>
                    <button className={activeTf === "1d" ? "active" : ""} onClick={() => setActiveTf("1d")}>1D</button>
                  </div>
                </div>

                <iframe
                  key={`${activeSymbol.symbol}-${activeTf}`}
                  className="chart"
                  title={`${activeSymbol.symbol} chart`}
                  src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                    `HYPERLIQUID:${activeSymbol.symbol}USDC`
                  )}&interval=${activeTf === "4h" ? "240" : "D"}&theme=dark&style=1&timezone=Etc%2FUTC&hidesidetoolbar=1&hideideas=1`}
                />

                <div className="plan">
                  <span>Entry: {activeSymbol.signals[activeTf].entry?.toFixed(4) ?? "-"}</span>
                  <span>TP: {activeSymbol.signals[activeTf].tp?.toFixed(4) ?? "-"}</span>
                  <span>SL: {activeSymbol.signals[activeTf].sl?.toFixed(4) ?? "-"}</span>
                  <span>Conf: {activeSymbol.signals[activeTf].confidence}%</span>
                </div>

                <pre className="reason">{activeSymbol.signals[activeTf].reason}</pre>

                <div className="outcome-buttons">
                  <button onClick={() => markResult(true)}>TP Hit</button>
                  <button onClick={() => markResult(false)}>SL Hit</button>
                </div>
              </>
            ) : (
              <p className="muted">Pick a coin to inspect signal details.</p>
            )}
          </aside>
        </section>
      ) : (
        <section className="cards">
          {signalCards.map((row) => (
            <article className="signal-card" key={row.symbol}>
              <div className="signal-head">
                <h3>{row.symbol}</h3>
                <span className={signalClass[row.signals.primary.direction]}>{row.signals.primary.direction}</span>
              </div>
              <p className="muted">
                Confidence {row.signals.primary.confidence}% · RR {row.signals.primary.riskReward?.toFixed(2)}
              </p>
              <p className="muted">
                Entry {row.signals.primary.entry?.toFixed(4)} · TP {row.signals.primary.tp?.toFixed(4)} · SL {row.signals.primary.sl?.toFixed(4)}
              </p>
              <pre className="reason compact">{row.signals.primary.reason}</pre>
            </article>
          ))}
          {!signalCards.length && !loading && <p className="muted">No directional setups right now.</p>}
        </section>
      )}

      <footer className="footer muted">
        Updated: {dashboard ? new Date(dashboard.updatedAt).toLocaleString() : "-"} ·
        Live trading execution can be added later via Hyperliquid order endpoints.
      </footer>
    </main>
  );
}
