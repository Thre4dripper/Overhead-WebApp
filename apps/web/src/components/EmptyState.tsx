import { useApp } from '../lib/store';

const COPY = ['Clear overhead. Nothing but sky up there.', 'Quiet airspace. Check back after the next wave.', 'No traffic overhead right now.'];

export function EmptyState() {
  const conn = useApp((s) => s.conn);
  const count = useApp((s) => s.count);
  const inRange = useApp((s) => s.overhead.length);
  const selected = useApp((s) => s.selected);
  if (selected || count > 0 || inRange > 0 || conn.status === 'connecting') return null;
  // The illustration carries its own copy line ("Clear overhead. Nothing but sky up there.") in its lower band.
  return (
    <div className="empty" aria-live="polite" aria-label={COPY[0]}>
      <img src="/assets/empty-state.svg" alt="" />
    </div>
  );
}
