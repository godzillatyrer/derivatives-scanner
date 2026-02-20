'use client';
import { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';

export function WinRateChart({ weightHistory }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !weightHistory || weightHistory.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const data = weightHistory.map(wh => wh.winRate);
    const min = Math.max(0, Math.min(...data) - 0.05);
    const max = Math.min(1, Math.max(...data) + 0.05);
    const range = max - min || 0.1;
    const stepX = w / (data.length - 1);
    const padY = 20;

    // Grid
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padY + ((h - padY * 2) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 50% line
    const y50 = padY + ((1 - (0.5 - min) / range) * (h - padY * 2));
    ctx.strokeStyle = '#52525b';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y50);
    ctx.lineTo(w, y50);
    ctx.stroke();
    ctx.setLineDash([]);

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = padY + ((1 - (data[i] - min) / range) * (h - padY * 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill
    ctx.lineTo((data.length - 1) * stepX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Labels
    ctx.fillStyle = '#71717a';
    ctx.font = '10px monospace';
    ctx.fillText(`${(max * 100).toFixed(0)}%`, 4, padY - 4);
    ctx.fillText(`${(min * 100).toFixed(0)}%`, 4, h - padY + 12);
    ctx.fillText('50%', w - 24, y50 - 4);
  }, [weightHistory]);

  if (!weightHistory || weightHistory.length < 2) {
    return (
      <Card>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Win Rate Over Time</h3>
        <p className="text-zinc-500 text-sm text-center py-6">
          Not enough data yet. Win rate will be tracked as signals resolve.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Win Rate Over Time</h3>
      <canvas ref={canvasRef} className="w-full h-40" />
    </Card>
  );
}
