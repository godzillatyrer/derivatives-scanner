import clsx from 'clsx';

export function Badge({ children, variant = 'default', size = 'md', className }) {
  const variants = {
    default: 'bg-zinc-800 text-zinc-300',
    long: 'bg-long-bg text-long border border-long/20',
    short: 'bg-short-bg text-short border border-short/20',
    neutral: 'bg-zinc-800 text-zinc-400',
    success: 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/20',
    danger: 'bg-red-900/40 text-red-400 border border-red-500/20',
    warning: 'bg-yellow-900/40 text-yellow-400 border border-yellow-500/20',
    accent: 'bg-violet-900/40 text-violet-400 border border-violet-500/20',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md font-medium',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
