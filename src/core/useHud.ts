import { useEffect, useState } from 'react';
import { UI } from '../config';
import { engine, type HudState } from './Engine';

/** Poll the engine at UI.hudRefreshHz (plus instant pushes on mode/status/toast changes). */
export function useHud(): HudState {
  const [hud, setHud] = useState<HudState>(() => engine.hud());
  useEffect(() => {
    const tick = () => setHud(engine.hud());
    const timer = setInterval(tick, 1000 / UI.hudRefreshHz);
    const unsub = engine.subscribe(tick);
    return () => { clearInterval(timer); unsub(); };
  }, []);
  return hud;
}
