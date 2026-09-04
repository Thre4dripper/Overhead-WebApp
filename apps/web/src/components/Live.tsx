import { useEffect } from 'react';
import { About } from './About';
import { Alerts } from './Alerts';
import { ArView } from './ArView';
import { ChartView } from './ChartView';
import { DetailPanel } from './DetailPanel';
import { Logbook } from './Logbook';
import { MapView } from './MapView';
import { OverheadSheet } from './OverheadSheet';
import { AltitudeRuler } from './hud/AltitudeRuler';
import { Attribution } from './hud/Attribution';
import { Compass } from './hud/Compass';
import { DataBlock } from './hud/DataBlock';
import { HeadingTape } from './hud/HeadingTape';
import { ScaleTilt } from './hud/ScaleTilt';
import { StatusLine } from './hud/StatusLine';
import { TopControls } from './hud/TopControls';
import { useApp } from '../lib/store';
import { hasWebGL2 } from '../lib/webgl';

const WEBGL = hasWebGL2();

export function Live() {
  const panel = useApp((s) => s.panel);
  const selected = useApp((s) => s.selected);
  const toast = useApp((s) => s.toast);
  useEffect(() => { if (selected) useApp.getState().setSheetOpen(false); }, [selected]);
  return (
    <div className="app">
      {WEBGL ? <MapView /> : <ChartView />}
      <div className="hud">
        {WEBGL && <AltitudeRuler />}
        {WEBGL && <Compass />}
        {WEBGL && <ScaleTilt />}
        {WEBGL && <HeadingTape />}
        {WEBGL && <DataBlock />}
        <TopControls />
        <StatusLine />
        <Attribution />
      </div>
      {selected ? <DetailPanel /> : <OverheadSheet />}
      {panel === 'about' && <About />}
      {panel === 'logbook' && <Logbook />}
      {panel === 'alerts' && <Alerts />}
      {panel === 'ar' && <ArView />}
      {toast && <div className="toast" role="status">{toast.img && <img src={toast.img} alt="" />}<span>{toast.text}</span></div>}
    </div>
  );
}
