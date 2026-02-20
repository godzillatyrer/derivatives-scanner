import { HYPERLIQUID_API } from './constants';

async function post(body) {
  const res = await fetch(HYPERLIQUID_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status}`);
  return res.json();
}

export async function fetchMeta() {
  const data = await post({ type: 'meta' });
  return data.universe.map((asset, idx) => ({
    index: idx,
    name: asset.name,
    szDecimals: asset.szDecimals,
    maxLeverage: asset.maxLeverage,
  }));
}

export async function fetchAllMids() {
  return post({ type: 'allMids' });
}

export async function fetchMetaAndAssetCtxs() {
  const [meta, ctxs] = await post({ type: 'metaAndAssetCtxs' });
  return meta.universe.map((asset, idx) => {
    const ctx = ctxs[idx] || {};
    return {
      index: idx,
      name: asset.name,
      szDecimals: asset.szDecimals,
      maxLeverage: asset.maxLeverage,
      volume24h: parseFloat(ctx.dayNtlVlm || '0'),
      openInterest: parseFloat(ctx.openInterest || '0'),
      funding: parseFloat(ctx.funding || '0'),
      markPx: parseFloat(ctx.markPx || '0'),
      prevDayPx: parseFloat(ctx.prevDayPx || '0'),
      premium: parseFloat(ctx.premium || '0'),
    };
  });
}

export async function fetchCandles(coin, interval, startTime, endTime) {
  const data = await post({
    type: 'candleSnapshot',
    req: {
      coin,
      interval,
      startTime,
      endTime: endTime || Date.now(),
    },
  });
  return data.map(c => ({
    time: c.t / 1000,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

export async function fetchRecentCandles(coin, interval, count = 300) {
  const intervalMs = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  const ms = intervalMs[interval] || 60 * 60 * 1000;
  const startTime = Date.now() - ms * count;
  return fetchCandles(coin, interval, startTime);
}
