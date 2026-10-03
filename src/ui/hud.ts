import { FLY, GLOBAL_ACTIONS, MODE_COLORS, MODE_HINTS, MODE_ORDER, type FlyAxis } from '../config';
import { flyDeflection, flyLabel } from '../modes/fly';
import { BleSource } from '../input/BleSource';
import type { GloveManager } from '../input/GloveManager';
import type { GloveSession } from '../modes/types';

export interface HudActions {
  connectBle(gloveId: number): void;
  toggleSim(gloveId: number): void;
  recenter(gloveId: number): void;
  disconnect(gloveId: number): void;
  exportSTL(): void;
  undo(): void;
  /** Flip FLY rotation between rate (keeps turning) and absolute (follows the hand angle). */
  toggleRotateStyle(): void;
  /** Mouse shortcuts for what the glove buttons do: pick a mode, or a FLY state, directly. */
  setMode(gloveId: number, modeIndex: number): void;
  setFlyAxis(gloveId: number, axis: FlyAxis | null): void;
}

interface GlovePanel {
  root: HTMLElement;
  status: HTMLElement;
  rpy: HTMLElement[];
  buttons: HTMLElement[];
  connect: HTMLButtonElement;
  sim: HTMLButtonElement;
  recenter: HTMLButtonElement;
  disconnect: HTMLButtonElement;
  cursor: HTMLElement;
  modeLabel: HTMLElement;
  modeName: HTMLElement;
  modeHint: HTMLElement;
  axisLabel: HTMLElement;
  flyRow: HTMLElement;
  flyChips: HTMLElement[];
  flyAmt: HTMLElement;
  modeChips: HTMLElement[];
}

const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0) + '°';

export class Hud {
  private panels: GlovePanel[] = [];
  private toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private rotateBtn: HTMLButtonElement;

  constructor(root: HTMLElement, gloves: GloveManager, actions: HudActions) {
    root.innerHTML = `
      <div id="modes"></div>
      <div id="toolbar" class="panel">
        <button id="undo" title="Undo (B${GLOBAL_ACTIONS.undo.button})">↶ Undo</button>
        <button id="recenter-all" title="Zero every glove's orientation">⌖ Recenter</button>
        <button id="rotate-style" title="FLY rotation: rate = tilt sets turn speed and keeps turning; absolute = camera follows the hand angle and stays there"></button>
        <button id="export">⬇ Export STL</button>
      </div>
      <div id="gloves"></div>
      <div id="help">
        <b>Glove:</b> tap B0 next mode · hold B0 previous · B3 undo<br/>
        <b>FLY:</b> tap B1 (pinky) alternates MOVE X / ROTATE / MOVE Y / ROTATE / MOVE Z … · tilt to move or look<br/>
        <b>Simulator:</b> <kbd>←→</kbd> roll <kbd>↑↓</kbd> pitch <kbd>Q</kbd><kbd>E</kbd> yaw · drag mouse to tilt<br/>
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> = buttons B0–B3 (hold = hold)
      </div>
      <div id="toast"></div>
    `;
    this.toastEl = root.querySelector('#toast')!;
    root.querySelector<HTMLButtonElement>('#undo')!.onclick = () => actions.undo();
    root.querySelector<HTMLButtonElement>('#recenter-all')!.onclick = () => gloves.gloves.forEach((g) => actions.recenter(g.gloveId));
    root.querySelector<HTMLButtonElement>('#export')!.onclick = () => actions.exportSTL();
    this.rotateBtn = root.querySelector<HTMLButtonElement>('#rotate-style')!;
    this.rotateBtn.onclick = () => actions.toggleRotateStyle();
    this.syncRotateButton();

    const modes = root.querySelector('#modes')!;
    const glovesEl = root.querySelector('#gloves')!;
    gloves.gloves.forEach((g) => {
      const color = gloves.color(g.gloveId);
      const panel = document.createElement('section');
      panel.className = 'glove panel';
      panel.style.setProperty('--glove', color);
      panel.innerHTML = `
        <header>
          <div class="name"><span class="dot"></span>Glove ${g.gloveId + 1}</div>
          <div class="status">disconnected</div>
        </header>
        <div class="rpy">
          <div><span>ROLL</span><b>+0°</b></div>
          <div><span>PITCH</span><b>+0°</b></div>
          <div><span>YAW</span><b>+0°</b></div>
        </div>
        <div class="buttons"><i>B0</i><i>B1</i><i>B2</i><i>B3</i></div>
        <div class="modes" title="Click a mode (same as tapping B0)">${MODE_ORDER.map((m) => `<i data-mode="${m}" style="--mode:${MODE_COLORS[m]}">${m}</i>`).join('')}</div>
        <div class="fly" title="FLY state: click, or press the pinky button (B1) to alternate ROTATE and a MOVE axis"><span>FLY</span><i data-axis="">ROTATE</i><i data-axis="X">X</i><i data-axis="Y">Y</i><i data-axis="Z">Z</i><b class="amt" title="move amount along the active axis (−1 … +1)"><u></u></b></div>
        <div class="actions">
          <button class="connect">Connect Glove</button>
          <button class="sim">Simulator</button>
          <button class="recenter">Recenter</button>
          <button class="disconnect" hidden>✕</button>
        </div>`;
      glovesEl.appendChild(panel);

      const cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.style.setProperty('--glove', color);
      cursor.style.display = 'none';
      root.appendChild(cursor);

      const modeLabel = document.createElement('div');
      modeLabel.className = 'mode-label' + (g.gloveId > 0 ? ' secondary' : '');
      modeLabel.style.setProperty('--glove', color);
      modeLabel.innerHTML = `<span class="tag">G${g.gloveId + 1}</span><span class="name"></span>`;
      const modeHint = document.createElement('div');
      modeHint.className = 'mode-hint';
      const axisLabel = document.createElement('div');
      axisLabel.className = 'axis-label';
      axisLabel.style.display = 'none';
      const wrap = document.createElement('div');
      wrap.append(modeLabel, modeHint, axisLabel);
      wrap.style.display = 'none';
      modes.appendChild(wrap);

      const p: GlovePanel = {
        root: panel,
        status: panel.querySelector('.status')!,
        rpy: [...panel.querySelectorAll<HTMLElement>('.rpy b')],
        buttons: [...panel.querySelectorAll<HTMLElement>('.buttons i')],
        connect: panel.querySelector('.connect')!,
        sim: panel.querySelector('.sim')!,
        recenter: panel.querySelector('.recenter')!,
        disconnect: panel.querySelector('.disconnect')!,
        cursor,
        modeLabel: wrap,
        modeName: modeLabel.querySelector('.name')!,
        modeHint,
        axisLabel,
        flyRow: panel.querySelector('.fly')!,
        flyChips: [...panel.querySelectorAll<HTMLElement>('.fly i')],
        flyAmt: panel.querySelector('.fly .amt u')!,
        modeChips: [...panel.querySelectorAll<HTMLElement>('.modes i')],
      };
      p.modeChips.forEach((chip, idx) => (chip.onclick = () => actions.setMode(g.gloveId, idx)));
      p.flyChips.forEach((chip) => (chip.onclick = () => actions.setFlyAxis(g.gloveId, (chip.dataset.axis || null) as FlyAxis | null)));
      p.connect.onclick = () => actions.connectBle(g.gloveId);
      p.sim.onclick = () => actions.toggleSim(g.gloveId);
      p.recenter.onclick = () => actions.recenter(g.gloveId);
      p.disconnect.onclick = () => actions.disconnect(g.gloveId);
      if (!BleSource.supported) { p.connect.disabled = true; p.connect.title = 'Web Bluetooth needs Chrome on https:// or localhost'; }
      this.panels.push(p);
    });
  }

  /** Reflect the current FLY rotation style on the toolbar button. */
  syncRotateButton(): void {
    const abs = FLY.rotate.style === 'absolute';
    this.rotateBtn.textContent = abs ? '⟳ Rotate: absolute' : '⟳ Rotate: rate';
    this.rotateBtn.classList.toggle('active', abs);
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1400);
  }

  /** Called every frame. */
  update(sessions: GloveSession[], width: number, height: number): void {
    sessions.forEach((s, i) => {
      const p = this.panels[i];
      const g = s.glove;
      const st = g.state;
      p.rpy[0].textContent = fmt(st.roll);
      p.rpy[1].textContent = fmt(st.pitch);
      p.rpy[2].textContent = fmt(st.yaw);
      st.buttons.forEach((b, k) => p.buttons[k].classList.toggle('down', b));

      const stale = g.connected && g.sourceKind === 'ble' && performance.now() - g.lastSampleAt > 1500;
      const label = g.status === 'connected'
        ? `${g.sourceKind === 'sim' ? 'simulator' : g.statusDetail || 'connected'}${stale ? ' · no data' : ''}`
        : g.statusDetail || g.status;
      if (p.status.textContent !== label) p.status.textContent = label;
      p.status.classList.toggle('on', g.connected && !stale);
      p.sim.classList.toggle('active', g.sourceKind === 'sim');
      p.connect.classList.toggle('active', g.sourceKind === 'ble' && g.connected);
      p.connect.textContent = g.sourceKind === 'ble' && g.status === 'connecting' ? 'Connecting…' : 'Connect Glove';
      p.disconnect.hidden = !g.source;

      // Mode label (only shown when the glove is active; glove 1 always shown)
      const modeName = MODE_ORDER[s.modeIndex];
      const show = g.gloveId === 0 || g.connected;
      p.modeLabel.style.display = show ? '' : 'none';
      if (p.modeName.textContent !== modeName) {
        p.modeName.textContent = modeName;
        p.modeHint.textContent = MODE_HINTS[modeName];
        p.modeLabel.querySelector<HTMLElement>('.mode-label')!.style.setProperty('--mode', MODE_COLORS[modeName]);
      }
      // FLY: active translation axis, large so it reads from across the room, plus chips in the panel.
      const axisText = modeName === 'FLY' ? flyLabel(s) : '';
      p.flyRow.style.display = modeName === 'FLY' ? '' : 'none';
      p.modeChips.forEach((c, k) => c.classList.toggle('on', k === s.modeIndex));
      const active = axisText === 'ROTATE' ? 0 : ['X', 'Y', 'Z'].indexOf(axisText.slice(-1)) + 1;
      p.flyChips.forEach((c, k) => c.classList.toggle('on', k === active));
      // Deflection bar: fills from the centre toward − or + along the active axis.
      const amt = modeName === 'FLY' ? flyDeflection(s) : 0;
      p.flyAmt.style.left = amt < 0 ? `${50 + amt * 50}%` : '50%';
      p.flyAmt.style.width = `${Math.abs(amt) * 50}%`;
      if (p.axisLabel.textContent !== axisText) {
        p.axisLabel.textContent = axisText;
        p.axisLabel.style.display = axisText ? '' : 'none';
        p.axisLabel.style.setProperty('--mode', MODE_COLORS[modeName]);
      }

      // Cursor
      p.cursor.style.display = g.connected || g.gloveId === 0 ? '' : 'none';
      p.cursor.style.left = `${((s.ndc.x + 1) / 2) * width}px`;
      p.cursor.style.top = `${((1 - s.ndc.y) / 2) * height}px`;
      p.cursor.classList.toggle('hover', !!s.hit);
    });
  }
}
