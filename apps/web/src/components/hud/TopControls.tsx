import { navigate } from '../../lib/router';
import { useApp } from '../../lib/store';
import type { ThemeChoice } from '../../lib/solar';

const ORDER: ThemeChoice[] = ['auto', 'day', 'golden', 'night'];

export function TopControls() {
  const choice = useApp((s) => s.themeChoice);
  const theme = useApp((s) => s.theme);
  const setThemeChoice = useApp((s) => s.setThemeChoice);
  const setPanel = useApp((s) => s.setPanel);
  const next = () => setThemeChoice(ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!);
  return (
    <div className="hud-topright">
      <button className="iconbtn" aria-label="Home page" onClick={() => navigate('/')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 11l8-7 8 7M6 10v10h12V10" /></svg>
      </button>
      <button className="iconbtn" aria-label="Menu and settings" onClick={() => setPanel('about')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <button className="iconbtn" aria-label={`Theme: ${choice}${choice === 'auto' ? ` (${theme})` : ''}. Tap to change`} onClick={next} title={`Theme: ${choice}`}>
        {theme === 'night' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M15 3a8 8 0 1 0 6 13.5A9 9 0 0 1 15 3z" /></svg>
        ) : theme === 'golden' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 16h16M12 4v2M5 8l1.4 1.4M19 8l-1.4 1.4" /><path d="M7 16a5 5 0 0 1 10 0" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>
        )}
        {choice === 'auto' && <span style={{ position: 'absolute', fontSize: 8, marginTop: 30, marginLeft: 22, letterSpacing: '0.08em' }}>A</span>}
      </button>
      <button className="iconbtn" aria-label="Point at the sky (AR view)" onClick={() => setPanel('ar')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M12 15l-3-2.2 3-6 3 6z" /></svg>
      </button>
    </div>
  );
}
