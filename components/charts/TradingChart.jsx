'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export function TradingChart({
  candles,
  indicators = {},
  signal = null,
  height = 500,
  enabledIndicators = { ema: true, bollingerBands: false, ichimoku: false, volume: true },
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let chart;
    async function init() {
      const { createChart, CrosshairMode, LineStyle } = await import('lightweight-charts');

      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { color: '#18181b' },
          textColor: '#71717a',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#27272a' },
          horzLines: { color: '#27272a' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#52525b', width: 1, style: LineStyle.Dashed },
          horzLine: { color: '#52525b', width: 1, style: LineStyle.Dashed },
        },
        rightPriceScale: {
          borderColor: '#3f3f46',
        },
        timeScale: {
          borderColor: '#3f3f46',
          timeVisible: true,
        },
      });

      chartRef.current = chart;

      // Candlestick series
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });
      seriesRef.current.candles = candleSeries;

      // Volume
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      seriesRef.current.volume = volumeSeries;

      // Resize observer
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      resizeObserver.observe(containerRef.current);

      setReady(true);

      return () => {
        resizeObserver.disconnect();
        chart.remove();
      };
    }

    init();

    return () => {
      if (chart) chart.remove();
    };
  }, [height]);

  // Update data
  useEffect(() => {
    if (!ready || !candles || candles.length === 0) return;
    const chart = chartRef.current;
    if (!chart) return;

    // Candlestick data
    seriesRef.current.candles?.setData(candles);

    // Volume data
    if (seriesRef.current.volume) {
      seriesRef.current.volume.setData(
        candles.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }))
      );
    }

    // EMA overlays
    if (enabledIndicators.ema && indicators.ema) {
      const colors = { 9: '#f59e0b', 21: '#3b82f6', 50: '#8b5cf6', 200: '#ec4899' };
      for (const [period, values] of Object.entries(indicators.ema)) {
        const key = `ema_${period}`;
        if (!seriesRef.current[key]) {
          seriesRef.current[key] = chart.addLineSeries({
            color: colors[period] || '#71717a',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          });
        }
        const data = [];
        for (let i = 0; i < candles.length; i++) {
          if (values[i] != null) {
            data.push({ time: candles[i].time, value: values[i] });
          }
        }
        seriesRef.current[key].setData(data);
      }
    }

    // Bollinger Bands
    if (enabledIndicators.bollingerBands && indicators.bollingerBands) {
      const bb = indicators.bollingerBands;
      for (const [band, color] of [['upper', '#52525b'], ['middle', '#71717a'], ['lower', '#52525b']]) {
        const key = `bb_${band}`;
        if (!seriesRef.current[key]) {
          seriesRef.current[key] = chart.addLineSeries({
            color,
            lineWidth: 1,
            lineStyle: band === 'middle' ? 0 : 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
        }
        const data = [];
        for (let i = 0; i < candles.length; i++) {
          if (bb[band][i] != null) {
            data.push({ time: candles[i].time, value: bb[band][i] });
          }
        }
        seriesRef.current[key].setData(data);
      }
    }

    // Signal markers (TP/SL lines)
    if (signal) {
      const markers = [];
      if (signal.entry) {
        markers.push({
          time: candles[candles.length - 1].time,
          position: signal.direction?.includes('LONG') ? 'belowBar' : 'aboveBar',
          color: '#8b5cf6',
          shape: signal.direction?.includes('LONG') ? 'arrowUp' : 'arrowDown',
          text: `Entry ${signal.entry.toFixed(2)}`,
        });
      }
      if (markers.length > 0) {
        seriesRef.current.candles?.setMarkers(markers);
      }
    }

    chart.timeScale().fitContent();
  }, [ready, candles, indicators, enabledIndicators, signal]);

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden bg-surface-100">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
