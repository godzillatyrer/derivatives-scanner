import clsx from 'clsx';

export function Spinner({ size = 'md', className }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-10 w-10',
  };
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          'animate-spin rounded-full border-2 border-zinc-700 border-t-accent',
          sizes[size]
        )}
      />
    </div>
  );
}

export function LoadingScreen({ text = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <Spinner size="lg" />
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
