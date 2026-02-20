"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const REFRESH_MS = 4000;

export default function PaperPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadState() {
    try {
      setError(null);
      const res = await fetch("/api/paper/state", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch paper account");
      setState(json);
    } catch (e) {
      setError(e?.message || "Error loading paper account");
    } finally {
      setLoading(false);
    }
  }

  async function resetAccount() {
    const ok = window.confirm("Reset paper account to 10,000 USDC and clear all trades?");
    if (!ok) return;
    await fetch("/api/paper/state", { method: "DELETE" });
    loadState();
  }

  useEffect(() => {
    loadState();
    const id = setInterval(loadState, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const closed = state?.closedTrades || [];
  const recentClosed = useMemo(() => closed.slice(0, 25), [closed]);

  return (
    <main className="page colorful-bg">
      <header className="hero">
        <div>
          <h1>Paper Trading Portfolio</h1>
          <p>
            Starting balance: 10,000 USDC. Every signal trade uses risk-managed position sizing,
            TP/SL automation, no duplicate open position per coin, and stored reasoning.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="nav-link" href="/">
            Back to Scanner
          </Link>
          <button onClick={loadState}>Refresh</button>
          <button onClick={resetAccount}>Reset 10k</button>
        </div>
      </header>

      {loading && <p className="muted">Loading paper account...</p>}
      {error && <p className="error">{error}</p>}

      {state && (
        <>
          <section className="stats-grid">
            <article className="stat vibrant"><span>Balance</span><strong>${state.balance.toFixed(2)}</strong></article>
            <article className="stat"><span>Equity</span><strong>${state.equity.toFixed(2)}</strong></article>
            <article className="stat"><span>Win ratio</span><strong>{state.winRate.toFixed(1)}%</strong></article>
            <article className="stat"><span>Wins / Losses</span><strong>{state.wins} / {state.losses}</strong></article>
            <article className="stat"><span>Open trades</span><strong>{state.openTrades.length}</strong></article>
            <article className="stat"><span>Risk per trade</span><strong>{state.riskPerTradePct}%</strong></article>
          </section>

          <section className="layout single-col-mobile" style={{ marginTop: 12 }}>
            <div className="table-card">
              <h3 className="section-title">Open Trades</h3>
              <table>
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Side</th>
                    <th>Entry</th>
                    <th>Mark</th>
                    <th>TP</th>
                    <th>SL</th>
                    <th>Qty</th>
                    <th>uPnL</th>
                  </tr>
                </thead>
                <tbody>
                  {state.openTrades.map((t) => (
                    <tr key={t.id}>
                      <td>{t.symbol}</td>
                      <td>{t.direction}</td>
                      <td>{t.entry.toFixed(4)}</td>
                      <td>{(t.markPrice ?? t.entry).toFixed(4)}</td>
                      <td>{t.tp.toFixed(4)}</td>
                      <td>{t.sl.toFixed(4)}</td>
                      <td>{t.qty.toFixed(3)}</td>
                      <td className={(t.unrealizedPnl || 0) >= 0 ? "up" : "down"}>
                        {(t.unrealizedPnl || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {!state.openTrades.length && (
                    <tr>
                      <td colSpan={8} className="muted">No open trades yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="detail-card">
              <h3 className="section-title">Closed Trades (Recent)</h3>
              <div className="history-list">
                {recentClosed.map((t) => (
                  <article className="history-item" key={t.id + t.closedAt}>
                    <div className="history-top">
                      <strong>{t.symbol}</strong>
                      <span className={t.pnl >= 0 ? "up" : "down"}>{t.pnl.toFixed(2)} USDC</span>
                    </div>
                    <p className="muted">
                      {t.direction.toUpperCase()} · {t.timeframe} · {t.status.toUpperCase()} · Entry {t.entry.toFixed(4)} → Exit {t.exitPrice.toFixed(4)}
                    </p>
                    <pre className="reason compact">{t.reason}</pre>
                  </article>
                ))}
                {!recentClosed.length && <p className="muted">No closed trades yet.</p>}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
