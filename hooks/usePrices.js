'use client';
import { useWebSocket } from './useWebSocket';

export function usePrices() {
  const { isConnected, prices, lastUpdate } = useWebSocket();

  function getPrice(coin) {
    return prices[coin]?.price ?? null;
  }

  function getPriceData(coin) {
    return prices[coin] ?? null;
  }

  function getPriceChange(coin) {
    const data = prices[coin];
    if (!data || !data.prevPrice) return 0;
    return data.change;
  }

  return {
    isConnected,
    prices,
    lastUpdate,
    getPrice,
    getPriceData,
    getPriceChange,
  };
}
