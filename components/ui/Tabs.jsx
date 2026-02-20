'use client';
import { useState } from 'react';
import clsx from 'clsx';

export function Tabs({ tabs, defaultTab, onChange }) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);

  const handleClick = (id) => {
    setActive(id);
    onChange?.(id);
  };

  const activeTab = tabs.find(t => t.id === active);

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-800 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleClick(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors relative',
              active === tab.id
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className="ml-2 text-xs text-zinc-500">({tab.count})</span>
            )}
            {active === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>
      <div>{activeTab?.content}</div>
    </div>
  );
}
