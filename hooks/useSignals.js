'use client';
import { useState, useEffect, useCallback } from 'react';

export function useSignals(autoRefresh = true, interval = 60000) {
  const [signals, setSignals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSignals = useCallback(async (coin = null) => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (coin) params.set('coin', coin);
      const res = await fetch(`/api/signals?${params}`);
      if (!res.ok) throw new Error('Failed to fetch signals');
      const data = await res.json();
      setSignals(data.signals || []);
      setMeta(data.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    if (autoRefresh) {
      const timer = setInterval(fetchSignals, interval);
      return () => clearInterval(timer);
    }
  }, [fetchSignals, autoRefresh, interval]);

  return { signals, meta, loading, error, refresh: fetchSignals };
}

export function useSignalHistory() {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/history');
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      setHistory(data.signals || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, stats, loading, refresh: fetchHistory };
}
