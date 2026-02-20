'use client';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { formatTimeAgo } from '@/lib/utils';

export function Header({ isConnected, lastUpdate }) {
  const [workerStatus, setWorkerStatus] = useState(null);

  useEffect(() => {
    async function checkWorker() {
      try {
        const res = await fetch('/api/worker-status');
        const data = await res.json();
        setWorkerStatus(data);
      } catch {
        setWorkerStatus(null);
      }
    }
    checkWorker();
    const interval = setInterval(checkWorker, 30000);
    return () => clearInterval(interval);
  }, []);

  const workerOnline = workerStatus?.isOnline;

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

          {/* Worker Status */}
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'w-2 h-2 rounded-full',
                workerOnline ? 'bg-blue-400 animate-pulse-slow' : 'bg-zinc-600'
              )}
            />
            <span className={clsx('text-xs', workerOnline ? 'text-blue-400' : 'text-zinc-600')}>
              Worker {workerOnline ? 'Active' : 'Offline'}
            </span>
          </div>

          {/* WebSocket Status */}
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
