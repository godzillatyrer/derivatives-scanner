import clsx from 'clsx';

export function StatsBar({ stats }) {
  if (!stats) return null;

  const items = [
    { label: 'Coins Tracked', value: stats.totalCoins || 0 },
    { label: 'Active Signals', value: stats.signalCount || 0 },
    { label: 'Long', value: stats.longCount || 0, color: 'text-long' },
    { label: 'Short', value: stats.shortCount || 0, color: 'text-short' },
    {
      label: 'Win Rate',
      value: stats.learningStats?.winRate != null
        ? `${(stats.learningStats.winRate * 100).toFixed(1)}%`
        : 'N/A',
      color: stats.learningStats?.winRate > 0.5 ? 'text-long' : 'text-zinc-400',
    },
  ];

  return (
    <div className="flex items-center gap-6 px-6 py-2.5 bg-surface-200 border-b border-zinc-800 overflow-x-auto">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-zinc-500">{item.label}</span>
          <span className={clsx('text-sm font-semibold', item.color || 'text-white')}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
