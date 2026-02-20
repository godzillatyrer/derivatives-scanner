export function formatPrice(price, decimals) {
  if (price == null || isNaN(price)) return '—';
  const p = Number(price);
  if (decimals !== undefined) return p.toFixed(decimals);
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}

export function formatPercent(value, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

export function formatPercentRaw(value, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(decimals)}%`;
}

export function formatNumber(num, decimals = 2) {
  if (num == null || isNaN(num)) return '—';
  const n = Number(num);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(decimals) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(decimals) + 'K';
  return n.toFixed(decimals);
}

export function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function classifySignalDirection(score) {
  if (score >= 0.5) return 'STRONG_LONG';
  if (score >= 0.3) return 'LONG';
  if (score <= -0.5) return 'STRONG_SHORT';
  if (score <= -0.3) return 'SHORT';
  return 'NEUTRAL';
}

export function getDirectionColor(direction) {
  if (!direction) return 'text-zinc-400';
  const d = direction.toUpperCase();
  if (d.includes('LONG')) return 'text-long';
  if (d.includes('SHORT')) return 'text-short';
  return 'text-zinc-400';
}

export function getDirectionBg(direction) {
  if (!direction) return 'bg-zinc-800';
  const d = direction.toUpperCase();
  if (d.includes('LONG')) return 'bg-long-bg';
  if (d.includes('SHORT')) return 'bg-short-bg';
  return 'bg-zinc-800';
}

export function getConfidenceColor(confidence) {
  if (confidence >= 75) return 'text-long';
  if (confidence >= 50) return 'text-yellow-400';
  return 'text-zinc-400';
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
