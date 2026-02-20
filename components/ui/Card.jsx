import clsx from 'clsx';

export function Card({ children, className, hover = false, ...props }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-zinc-800 bg-surface-200 p-5',
        hover && 'transition-colors hover:border-zinc-700 hover:bg-surface-300',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }) {
  return <div className={clsx('mb-3', className)}>{children}</div>;
}

export function CardTitle({ children, className }) {
  return <h3 className={clsx('text-sm font-medium text-zinc-400', className)}>{children}</h3>;
}

export function CardValue({ children, className }) {
  return <div className={clsx('text-2xl font-bold text-white', className)}>{children}</div>;
}
