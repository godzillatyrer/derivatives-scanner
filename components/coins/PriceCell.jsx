'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatPrice } from '@/lib/utils';

export function PriceCell({ price, prevPrice }) {
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (price != null && prevPrice != null && price !== prevPrice) {
      setFlash(price > prevPrice ? 'green' : 'red');
      const timer = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(timer);
    }
  }, [price, prevPrice]);

  return (
    <span
      className={clsx(
        'font-mono text-sm transition-colors',
        flash === 'green' && 'animate-flash-green text-long-light',
        flash === 'red' && 'animate-flash-red text-short-light',
        !flash && 'text-zinc-200'
      )}
    >
      {formatPrice(price)}
    </span>
  );
}
