import { Badge } from '@/components/ui/Badge';

export function SignalBadge({ direction, size = 'md' }) {
  if (!direction) return <Badge variant="neutral" size={size}>—</Badge>;

  const d = direction.toUpperCase();
  if (d.includes('STRONG') && d.includes('LONG')) {
    return <Badge variant="long" size={size}>STRONG LONG</Badge>;
  }
  if (d.includes('LONG')) {
    return <Badge variant="long" size={size}>LONG</Badge>;
  }
  if (d.includes('STRONG') && d.includes('SHORT')) {
    return <Badge variant="short" size={size}>STRONG SHORT</Badge>;
  }
  if (d.includes('SHORT')) {
    return <Badge variant="short" size={size}>SHORT</Badge>;
  }
  return <Badge variant="neutral" size={size}>NEUTRAL</Badge>;
}
