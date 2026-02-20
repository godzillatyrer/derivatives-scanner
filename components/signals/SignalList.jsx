'use client';
import { useState, useMemo } from 'react';
import { SignalCard } from './SignalCard';
import { Select } from '@/components/ui/Select';

export function SignalList({ signals, showReasoning = true }) {
  const [dirFilter, setDirFilter] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return signals.filter(s => {
      if (dirFilter === 'long' && !s.direction?.includes('LONG')) return false;
      if (dirFilter === 'short' && !s.direction?.includes('SHORT')) return false;
      if (dirFilter === 'neutral' && s.direction !== 'NEUTRAL') return false;
      if (s.confidence < minConfidence) return false;
      if (searchQuery && !s.coin?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [signals, dirFilter, minConfidence, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search coins..."
          className="bg-surface-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent w-48"
        />
        <Select
          value={dirFilter}
          onChange={setDirFilter}
          options={[
            { value: 'all', label: 'All Directions' },
            { value: 'long', label: 'Long Only' },
            { value: 'short', label: 'Short Only' },
            { value: 'neutral', label: 'Neutral' },
          ]}
        />
        <Select
          value={String(minConfidence)}
          onChange={v => setMinConfidence(Number(v))}
          label="Min confidence"
          options={[
            { value: '0', label: 'Any' },
            { value: '30', label: '30%+' },
            { value: '50', label: '50%+' },
            { value: '70', label: '70%+' },
          ]}
        />
        <span className="text-xs text-zinc-500 ml-auto">
          {filtered.length} of {signals.length} signals
        </span>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-sm">
            No signals match your filters
          </div>
        ) : (
          filtered.map(signal => (
            <SignalCard
              key={signal.coin + signal.timestamp}
              signal={signal}
              showReasoning={showReasoning}
              compact
            />
          ))
        )}
      </div>
    </div>
  );
}
