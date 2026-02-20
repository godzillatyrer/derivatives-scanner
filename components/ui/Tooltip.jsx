'use client';
import { useState } from 'react';
import clsx from 'clsx';

export function Tooltip({ children, content, position = 'top' }) {
  const [show, setShow] = useState(false);

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={clsx(
            'absolute z-50 px-2.5 py-1.5 text-xs text-zinc-200 bg-zinc-900 border border-zinc-700 rounded-lg whitespace-nowrap',
            positions[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
