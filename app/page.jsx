"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchCandles, fetchMarketUniverse } from "@/lib/hyperliquid";
import { computeSignalFromCandles, pickPrimarySignal } from "@/lib/strategy";

const REFRESH_MS = 5000;

const signalClass = {
  long: "pill pill-long",
  short: "pill pill-short",
  neutral: "pill pill-neutral"
};

function tuningFromWinRate(winRate) {
  if (winRate >= 65) return { rr: 2.3, slAtr: 1.2 };
  if (winRate >= 55) return { rr: 2.0, slAtr: 1.3 };
  if (winRate <= 35) return { rr: 1.5, slAtr: 1.7 };
  return { rr: 1.8, slAtr: 1.45 };
}

async function pool(items, limit, worker) {
  const out = [];
  const queue = [];

  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item));
    out.push(task);

    if (limit <= items.length) {
      const p = task.then(() => queue.splice(queue.indexOf(p), 1));
      queue.push(p);
      if (queue.length >= limit) await Promise.race(queue);
    }
  }

  return Promise.all(out);
}

async function buildScannerData(tuning) {
  const market = await fetchMarketUniverse();
  const rows = [];

  await pool(market, 12, async (coin) => {
    try {
      const [c4h, c1d] = await Promise.all([
        fetchCandles(coin.symbol, "4h", 1000 * 60 * 60 * 24 * 80),
        fetchCandles(coin.symbol, "1d", 1000 * 60 * 60 * 24 * 260)
      ]);

      const signal4h = computeSignalFromCandles({
        candles: c4h,
        price: coin.price,
        tf: "4H",
        tuning
      });
      const signal1d = computeSignalFromCandles({
        candles: c1d,
        price: coin.price,
        tf: "1D",
        tuning
      });

      rows.push({
        ...coin,
        signals: {
          "4h": signal4h,
          "1d": signal1d,
          primary: pickPrimarySignal(signal4h, signal1d)
        }
      });
    } catch (error) {
      console.error("scan error", coin.symbol, error);
    }
  });

  rows.sort((a, b) => b.volume - a.volume);

  return {
    updatedAt: new Date().toISOString(),
    rows,
    totals: {
      coins: rows.length,
      directional: rows.filter((r) => r.signals.primary.direction !== "neutral").length,
      longs: rows.filter((r) => r.signals.primary.direction === "long").length,
      shorts: rows.filter((r) => r.signals.primary.direction === "short").length
    }
  };
}

async function fetchPaperState() {
  const res = await fetch("/api/paper/state", { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default function HomePage() {
  const [data, setData] = useState(null);
  const [paperState, setPaperState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSymbol, setActiveSymbol] = useState(null);
  const [tf, setTf] = useState("4h");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const winRate = paperState?.winRate ?? 0;
  const tuning = tuningFromWinRate(winRate);

  async function refresh() {
    try {
      setError(null);
      const [scanner, paper] = await Promise.all([
        buildScannerData(tuning),
        fetchPaperState()
      ]);
      setData(scanner);
      setPaperState(paper);

      if (!activeSymbol && scanner.rows.length) {
        setActiveSymbol(scanner.rows[0]);
      } else if (activeSymbol) {
        const updated = scanner.rows.find((r) => r.symbol === activeSymbol.symbol);
        if (updated) setActiveSymbol(updated);
      }
    } catch (e) {
      setError(e?.message || "Failed to load scanner");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [winRate]);

  const rows = data?.rows || [];

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = row.symbol.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (filter === "all") return true;
      return row.signals.primary.direction === filter;
    });
  }, [rows, search, filter]);

  async function openPaperTrade(row, timeframeKey) {
    const signal = row.signals[timeframeKey];
    if (!signal || !["long", "short"].includes(signal.direction)) return;

    const res = await fetch("/api/paper/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: row.symbol,
        direction: signal.direction,
        entry: signal.entry,
        tp: signal.tp,
        sl: signal.sl,
        timeframe: timeframeKey.toUpperCase(),
        confidence: signal.confidence,
        reason: signal.reason
      })
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error || "Could not open paper trade");
      return;
    }

    const updated = await fetchPaperState();
    setPaperState(updated);
  }

  return (
    <main className="page colorful-bg">
      <header className="hero">
        <div>
          <h1>Hyperliquid Signal HQ</h1>
          <p>
            Realtime all-coin scanner, live price updates (5s polling), adaptive win-rate strategy,
            and one-click paper trade execution.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={refresh}>Refresh now</button>
          <Link className="nav-link" href="/paper">
            Open Paper Trading (10k)
          </Link>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat vibrant"><span>Coins</span><strong>{data?.totals.coins ?? 0}</strong></article>
        <article className="stat"><span>Directional</span><strong>{data?.totals.directional ?? 0}</strong></article>
        <article className="stat"><span>Long / Short</span><strong>{data ? `${data.totals.longs} / ${data.totals.shorts}` : "0 / 0"}</strong></article>
        <article className="stat"><span>Win ratio</span><strong>{winRate.toFixed(1)}%</strong></article>
        <article className="stat"><span>Auto RR</span><strong>{tuning.rr.toFixed(2)}</strong></article>
        <article className="stat"><span>Auto SL ATR</span><strong>{tuning.slAtr.toFixed(2)}x</strong></article>
      </section>

      <section className="controls">
        <input placeholder="Search coin..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All signals</option>
          <option value="long">Long only</option>
          <option value="short">Short only</option>
        </select>
        <span className="muted">Realtime updates every {REFRESH_MS / 1000}s</span>
      </section>

      {loading && <p className="muted">Loading data...</p>}
      {error && <p className="error">{error}</p>}

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
                <th>Chart</th>
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
                  <td>
                    <a
                      className="inline-link"
                      href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
                        `HYPERLIQUID:${row.symbol}USDC`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      open
                    </a>
                  </td>
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
                  <button className={tf === "4h" ? "active" : ""} onClick={() => setTf("4h")}>4H</button>
                  <button className={tf === "1d" ? "active" : ""} onClick={() => setTf("1d")}>1D</button>
                </div>
              </div>

              <iframe
                key={`${activeSymbol.symbol}-${tf}`}
                className="chart"
                title={`${activeSymbol.symbol} realtime chart`}
                src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                  `HYPERLIQUID:${activeSymbol.symbol}USDC`
                )}&interval=${tf === "4h" ? "240" : "D"}&theme=dark&style=1&timezone=Etc%2FUTC&hidesidetoolbar=1&hideideas=1`}
              />

              <div className="plan">
                <span>Entry: {activeSymbol.signals[tf].entry?.toFixed(4) ?? "-"}</span>
                <span>TP: {activeSymbol.signals[tf].tp?.toFixed(4) ?? "-"}</span>
                <span>SL: {activeSymbol.signals[tf].sl?.toFixed(4) ?? "-"}</span>
                <span>Confidence: {activeSymbol.signals[tf].confidence}%</span>
              </div>

              <div className="action-row">
                <button onClick={() => openPaperTrade(activeSymbol, tf)}>Paper trade this signal</button>
                <Link className="inline-link" href="/paper">
                  View portfolio
                </Link>
              </div>

              <pre className="reason">{activeSymbol.signals[tf].reason}</pre>
            </>
          ) : (
            <p className="muted">Select a coin to view live chart and setup details.</p>
          )}
        </aside>
      </section>

      <footer className="footer muted">
        Updated: {data ? new Date(data.updatedAt).toLocaleString() : "-"} · Open trades: {paperState?.openTrades?.length ?? 0}
      </footer>
    </main>
  );
}
