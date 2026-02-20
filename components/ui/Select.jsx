import clsx from 'clsx';

export function Select({ value, onChange, options, className, label }) {
  return (
    <div className="flex items-center gap-2">
      {label && <label className="text-xs text-zinc-500">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={clsx(
          'bg-surface-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200',
          'focus:outline-none focus:border-accent appearance-none cursor-pointer',
          className
        )}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
