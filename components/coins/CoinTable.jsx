'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { PriceCell } from './PriceCell';
import { SignalBadge } from '@/components/signals/SignalBadge';
import { formatPrice, formatNumber, getConfidenceColor } from '@/lib/utils';

function formatFunding(rate) {
  if (rate == null || isNaN(rate)) return '—';
  const pct = (rate * 100).toFixed(4);
  return `${rate >= 0 ? '+' : ''}${pct}%`;
}

function formatChange(price, prevDayPx) {
  if (!price || !prevDayPx || prevDayPx === 0) return null;
  return ((price - prevDayPx) / prevDayPx) * 100;
}

export function CoinTable({ coins, prices, signals }) {
  const [sortKey, setSortKey] = useState('volume24h');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');

  const signalMap = useMemo(() => {
    const map = {};
    for (const s of (signals || [])) {
      map[s.coin] = s;
    }
    return map;
  }, [signals]);

  const sorted = useMemo(() => {
    let filtered = (coins || []).filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );

    filtered.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'name':
          va = a.name; vb = b.name;
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'price':
          va = prices[a.name]?.price || a.price || 0;
          vb = prices[b.name]?.price || b.price || 0;
          break;
        case 'change24h': {
          const pa = prices[a.name]?.price || a.price || 0;
          const pb = prices[b.name]?.price || b.price || 0;
          va = a.prevDayPx ? ((pa - a.prevDayPx) / a.prevDayPx) * 100 : 0;
          vb = b.prevDayPx ? ((pb - b.prevDayPx) / b.prevDayPx) * 100 : 0;
          break;
        }
        case 'volume24h':
          va = a.volume24h || 0;
          vb = b.volume24h || 0;
          break;
        case 'openInterest':
          va = a.openInterest || 0;
          vb = b.openInterest || 0;
          break;
        case 'marketCap':
          va = a.marketCap || 0;
          vb = b.marketCap || 0;
          break;
        case 'funding':
          va = a.funding || 0;
          vb = b.funding || 0;
          break;
        case 'confidence':
          va = signalMap[a.name]?.confidence || 0;
          vb = signalMap[b.name]?.confidence || 0;
          break;
        case 'signal':
          va = signalMap[a.name]?.score || 0;
          vb = signalMap[b.name]?.score || 0;
          break;
        default:
          return 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return filtered;
  }, [coins, prices, signalMap, sortKey, sortDir, search]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const columns = [
    { key: 'name', label: 'Coin' },
    { key: 'price', label: 'Price' },
    { key: 'change24h', label: '24h %' },
    { key: 'volume24h', label: '24h Volume' },
    { key: 'marketCap', label: 'Market Cap' },
    { key: 'openInterest', label: 'Open Interest' },
    { key: 'funding', label: 'Funding' },
    { key: 'signal', label: 'Signal' },
    { key: 'confidence', label: 'Confidence' },
    { key: null, label: 'Entry' },
    { key: null, label: 'TP1' },
    { key: null, label: 'SL' },
  ];

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search coins..."
        className="bg-surface-300 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent w-full max-w-xs"
      />

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-surface-200">
              {columns.map(col => (
                <th
                  key={col.label}
                  onClick={() => col.key && handleSort(col.key)}
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap',
                    col.key && 'cursor-pointer hover:text-zinc-300'
                  )}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {sorted.map(coin => {
              const priceData = prices[coin.name];
              const signal = signalMap[coin.name];
              const currentPrice = priceData?.price || coin.price;
              const change24h = formatChange(currentPrice, coin.prevDayPx);
              return (
                <tr
                  key={coin.name}
                  className="hover:bg-surface-300/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/coin/${coin.name}`}
                      className="font-medium text-white hover:text-accent transition-colors"
                    >
                      {coin.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <PriceCell
                      price={priceData?.price || coin.price}
                      prevPrice={priceData?.prevPrice}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">
                    {change24h != null ? (
                      <span className={clsx(
                        'font-medium',
                        change24h >= 0 ? 'text-long' : 'text-short'
                      )}>
                        {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                    {coin.volume24h ? `$${formatNumber(coin.volume24h)}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                    {coin.marketCap ? `$${formatNumber(coin.marketCap)}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                    {coin.openInterest ? `$${formatNumber(coin.openInterest * (currentPrice || 1))}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">
                    {coin.funding != null ? (
                      <span className={clsx(
                        'text-xs',
                        coin.funding >= 0 ? 'text-long' : 'text-short'
                      )}>
                        {formatFunding(coin.funding)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <SignalBadge direction={signal?.direction} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    {signal?.confidence != null ? (
                      <span className={clsx('font-mono font-medium', getConfidenceColor(signal.confidence))}>
                        {signal.confidence}%
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">
                    {signal?.entry ? formatPrice(signal.entry) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-long">
                    {signal?.takeProfits?.[0] ? formatPrice(signal.takeProfits[0]) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-short">
                    {signal?.stopLoss ? formatPrice(signal.stopLoss) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">
            No coins found
          </div>
        )}
      </div>
    </div>
  );
}
