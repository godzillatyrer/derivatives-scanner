const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

async function postInfo(payload) {
  const res = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hyperliquid request failed (${res.status}) ${res.statusText} ${text}`);
  }

  return res.json();
}

export async function fetchMarketUniverse() {
  const [meta, assetCtxs] = await postInfo({ type: "metaAndAssetCtxs" });
  const universe = meta?.universe || [];

  return universe
    .map((coin, index) => {
      const ctx = assetCtxs[index] || {};
      const price = Number(ctx.markPx ?? ctx.midPx ?? 0);
      const prev = Number(ctx.prevDayPx ?? 0);

      return {
        symbol: coin.name,
        price,
        priceChangePercent: prev > 0 ? ((price - prev) / prev) * 100 : 0,
        volume: Number(ctx.dayNtlVlm ?? 0),
        openInterest: Number(ctx.openInterest ?? 0),
        funding: Number(ctx.funding ?? 0)
      };
    })
    .filter((row) => Number.isFinite(row.price) && row.price > 0)
    .sort((a, b) => b.volume - a.volume);
}

export async function fetchCandles(symbol, interval, lookbackMs) {
  const endTime = Date.now();
  const startTime = endTime - lookbackMs;

  const data = await postInfo({
    type: "candleSnapshot",
    req: { coin: symbol, interval, startTime, endTime }
  });

  const closes = data.map((row) => Number(row.c));
  const highs = data.map((row) => Number(row.h));
  const lows = data.map((row) => Number(row.l));

  return {
    closes,
    highs,
    lows,
    raw: data
  };
}
