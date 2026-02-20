'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HYPERLIQUID_WS } from '@/lib/constants';

export function useWebSocket() {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [prices, setPrices] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(HYPERLIQUID_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'allMids' },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.channel === 'allMids' && data.data?.mids) {
            const newPrices = {};
            for (const [coin, price] of Object.entries(data.data.mids)) {
              newPrices[coin] = parseFloat(price);
            }
            setPrices(prev => {
              const updated = { ...prev };
              for (const [coin, price] of Object.entries(newPrices)) {
                updated[coin] = {
                  price,
                  prevPrice: prev[coin]?.price || price,
                  change: prev[coin]?.price ? price - prev[coin].price : 0,
                };
              }
              return updated;
            });
            setLastUpdate(Date.now());
          }
        } catch {}
      };

      ws.onclose = () => {
        setIsConnected(false);
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimeout.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { isConnected, prices, lastUpdate };
}
