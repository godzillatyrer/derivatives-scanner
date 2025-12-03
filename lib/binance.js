const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

/**
 * Fetch 24hr ticker stats for all futures symbols
 */
export async function fetchFuturesTickers() {
  const url = `${BINANCE_FUTURES_BASE}/fapi/v1/ticker/24hr`;

  const res = await fetch(url, {
    // always get fresh data from Binance
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch futures tickers (${res.status}) ${res.statusText} ${text}`
    );
  }

  const data = await res.json();
  return data;
}

/**
 * Fetch candles (klines) for symbol and interval.
 * interval example: "4h", "1d"
 */
export async function fetchKlines(symbol, interval, limit = 200) {
  const url = `${BINANCE_FUTURES_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch klines for ${symbol} ${interval} (${res.status}) ${res.statusText} ${text}`
    );
  }

  const data = await res.json();
  // data[i] = [ openTime, open, high, low, close, volume, ... ]
  const closes = data.map((k) => parseFloat(k[4]));
  const lastClose = closes[closes.length - 1] || null;
  return { raw: data, closes, lastClose };
}
