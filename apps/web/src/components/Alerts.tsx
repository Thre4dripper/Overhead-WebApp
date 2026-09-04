import type { WatchRuleKind } from '@overhead/shared';
import { useState } from 'react';
import { addRule, deleteRule, enableNotifications, toggleRule } from '../lib/account';
import { useApp } from '../lib/store';

const KINDS: { kind: WatchRuleKind; label: string; needsValue: boolean; hint?: string }[] = [
  { kind: 'type_code', label: 'Aircraft type', needsValue: true, hint: 'e.g. A388, B748, C17' },
  { kind: 'registration', label: 'Registration', needsValue: true, hint: 'e.g. G-XLEA' },
  { kind: 'operator', label: 'Operator', needsValue: true, hint: 'e.g. Emirates' },
  { kind: 'rare', label: 'Anything rare or military', needsValue: false },
  { kind: 'first_seen', label: 'Any aircraft I have never logged', needsValue: false },
];

export function Alerts() {
  const s = useApp();
  const [kind, setKind] = useState<WatchRuleKind>('type_code');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const k = KINDS.find((x) => x.kind === kind)!;
  const add = () => { addRule(kind, k.needsValue ? value.trim() : undefined); setValue(''); setMsg('Rule saved. Checked against everything above 20° while the app is open.'); };
  const enable = async () => {
    const r = await enableNotifications();
    setMsg(r === 'ok' ? 'Notifications enabled — you will get one when the tab is in the background.' : r === 'denied' ? 'Notification permission denied.' : 'This browser cannot show notifications.');
  };
  return (
    <div className="panel" role="dialog" aria-labelledby="al-title">
      <div className="panel-head">
        <button className="iconbtn" aria-label="Back" onClick={() => s.setPanel('about')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M15 6l-6 6 6 6" /></svg></button>
        <h1 id="al-title">Alerts</h1>
      </div>
      <p className="muted">Rules are checked in this browser against the aircraft over {s.home.label ?? 'your location'} while the app is open. One nudge per aircraft per hour, as a toast, or a notification when the tab is in the background.</p>
      <h3>New rule</h3>
      <div className="formrow">
        <select value={kind} onChange={(e) => setKind(e.target.value as WatchRuleKind)} aria-label="Rule kind">
          {KINDS.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}
        </select>
        {k.needsValue && <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.hint} aria-label="Value" />}
        <button className="btn primary small" onClick={add} disabled={k.needsValue && value.trim().length < 2}>Add</button>
      </div>
      <h3>Your rules</h3>
      {s.rules.length === 0 && <p className="muted">No rules yet.</p>}
      {s.rules.map((r) => (
        <div key={r.id} className="rulecard">
          <div style={{ flex: 1 }}>
            <div className="k">{KINDS.find((x) => x.kind === r.kind)?.label ?? r.kind}</div>
            <div className="v">{r.params.value ?? '—'}</div>
          </div>
          <button className="chip" aria-pressed={r.enabled} onClick={() => toggleRule(r.id, !r.enabled)}>{r.enabled ? 'On' : 'Off'}</button>
          <button className="chip" onClick={() => deleteRule(r.id)} aria-label="Delete rule">✕</button>
        </div>
      ))}
      <h3>Notifications</h3>
      <button className="btn" onClick={enable} disabled={s.notify}>{s.notify ? 'Notifications enabled' : 'Enable notifications on this device'}</button>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
