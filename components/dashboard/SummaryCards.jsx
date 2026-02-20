import { Card, CardHeader, CardTitle, CardValue } from '@/components/ui/Card';
import clsx from 'clsx';

export function SummaryCards({ meta, learningStats }) {
  const cards = [
    {
      title: 'Coins Tracked',
      value: meta?.totalCoins || 0,
      icon: '📊',
    },
    {
      title: 'Active Signals',
      value: meta?.signalCount || 0,
      sub: meta ? `${meta.longCount}L / ${meta.shortCount}S` : null,
      icon: '⚡',
    },
    {
      title: 'Win Rate',
      value: learningStats?.winRate != null
        ? `${(learningStats.winRate * 100).toFixed(1)}%`
        : 'N/A',
      color: learningStats?.winRate > 0.5 ? 'text-long' : learningStats?.winRate > 0 ? 'text-short' : '',
      sub: learningStats ? `${learningStats.wins}W / ${learningStats.losses}L` : null,
      icon: '🎯',
    },
    {
      title: 'Profit Factor',
      value: learningStats?.profitFactor != null
        ? learningStats.profitFactor === Infinity ? '∞' : learningStats.profitFactor.toFixed(2)
        : 'N/A',
      color: learningStats?.profitFactor > 1 ? 'text-long' : 'text-zinc-400',
      icon: '💰',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <Card key={card.title}>
          <CardHeader>
            <CardTitle>{card.title}</CardTitle>
          </CardHeader>
          <CardValue className={card.color}>{card.value}</CardValue>
          {card.sub && (
            <div className="text-xs text-zinc-500 mt-1">{card.sub}</div>
          )}
        </Card>
      ))}
    </div>
  );
}
