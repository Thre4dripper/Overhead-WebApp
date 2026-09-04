import { useEffect, useState } from 'react';
import { useApp } from '../../lib/store';

export function StatusLine() {
  const conn = useApp((s) => s.conn);
  const count = useApp((s) => s.count);
  const mode = useApp((s) => s.renderMode);
  const lastFrameAt = useApp((s) => s.lastFrameAt);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const age = lastFrameAt ? Math.round((Date.now() - lastFrameAt) / 1000) : null;
  const label = conn.status === 'live' ? 'Live' : conn.status === 'cached' ? 'Recent' : conn.status === 'demo' ? 'Demo traffic' : conn.status === 'offline' ? 'Offline' : 'Connecting';
  const warn = conn.status === 'demo' || conn.status === 'offline' || (age != null && age > 60);
  return (
    <div className={`hud-status${warn ? ' warn' : ''}`} role="status">
      <span className={`dot${conn.status === 'live' && (age ?? 99) < 30 ? ' live' : ''}`} />
      <span>{label}</span>
      {age != null && <span style={{ opacity: 0.6 }}>{age < 2 ? 'just now' : `${age} s ago`}</span>}
      {conn.status === 'demo' && <span style={{ opacity: 0.7 }}>not real aircraft</span>}
      {mode === 'flat' && <span style={{ opacity: 0.6 }}>flat map</span>}
      {count > 0 && <span style={{ opacity: 0.6 }}>{count} overhead</span>}
      {conn.creditsRemaining != null && conn.creditsRemaining > 0 && <span style={{ opacity: 0.6 }}>{conn.creditsRemaining} credits</span>}
      {conn.retryAt && Date.now() < conn.retryAt && <span>quota used, retry {Math.max(1, Math.round((conn.retryAt - Date.now()) / 60000))} min</span>}
    </div>
  );
}
