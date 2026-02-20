'use client';
import clsx from 'clsx';
import { formatTimeAgo } from '@/lib/utils';

export function Header({ isConnected, lastUpdate }) {
  return (
    <header className="sticky top-0 z-30 bg-surface-100/80 backdrop-blur-md border-b border-zinc-800">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="text-sm text-zinc-400">
          Hyperliquid Derivatives Scanner
        </div>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-xs text-zinc-500">
              Updated {formatTimeAgo(lastUpdate)}
            </span>
          )}
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-long animate-pulse-slow' : 'bg-short'
              )}
            />
            <span className={clsx('text-xs', isConnected ? 'text-long' : 'text-short')}>
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
