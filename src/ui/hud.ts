import { BUILD, FLY, MODE_COLORS, MODE_HINTS, MODE_ORDER, RUNTIME, type FlyAxis, type PrimitiveName, type SizeName } from '../config';
import { flyDeflection, flyLabel } from '../modes/fly';
import { ghostInfo } from '../modes/build';
import { applyProfile, currentVersion, cycleRole, OFF, PIN_PLACES, pinDown, pinsOf, profileName, profileOf, profilesFor, resetRoles, roleOf, ROLES, roleShort, type GloveVersion } from '../input/buttonMap';
import type { VoiceState } from './voice';
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
  /** Step the global sensitivity multiplier (same as pressing the sensitivity button). */
  cycleSensitivity(): void;
  /** X2D voice assistant: start a session, or end the current one. */
  toggleVoice(): void;
  /** Ask Gemini a question (answer is toasted and spoken). */
  askGemini(question: string): void;
  /** Choose the BUILD primitive for a glove. */
  setPrimitive(gloveId: number, p: PrimitiveName): void;
  /** Choose the BUILD piece size for a glove (same as B2 in BUILD). */
  setSize(gloveId: number, size: SizeName): void;
  /** Projects: open the dashboard, or save the current project (Cmd/Ctrl+S). */
  openProjects(): void;
  saveProject(): void;
}

interface GlovePanel {
  root: HTMLElement;
  status: HTMLElement;
  rpy: HTMLElement[];
  buttons: HTMLElement[];
  buttonsRow: HTMLElement;
  layoutsRow: HTMLElement;
  pinVersion: GloveVersion | null;
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
  shapeRow: HTMLElement;
  shapeChips: HTMLElement[];
  sizeChips: HTMLElement[];
  pos: HTMLElement;
}

const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0) + '°';

export class Hud {
  private panels: GlovePanel[] = [];
  private toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private rotateBtn: HTMLButtonElement;
  private sensBtn: HTMLButtonElement;
  private voiceBtn: HTMLButtonElement;
  private projectEl!: HTMLElement;

  /** Show the current project name in the toolbar; a dot marks unsaved changes. */
  syncProject(name: string | null, dirty: boolean): void {
    this.projectEl.textContent = name ?? 'unsaved build';
    this.projectEl.classList.toggle('dirty', dirty);
  }

  constructor(root: HTMLElement, gloves: GloveManager, actions: HudActions) {
    const btn = (id: string, icon: string, label: string, title: string) =>
      `<button id="${id}" title="${title}"><i>${icon}</i><span class="lbl">${label}</span></button>`;
    root.innerHTML = `
      <header id="topbar">
        <div class="brand"><img src="/favicon.svg" alt="" /><span>Aloft</span></div>
        <button id="project-chip" title="Current project · click for all projects (• = saving changes)"><span id="project-name">unsaved build</span></button>
        <div class="spacer"></div>
        <div class="group">
          ${btn('projects', '📁', 'Projects', 'Saved projects: open, continue, rename, delete')}
          ${btn('save', '💾', 'Save', 'Save this project (Cmd/Ctrl+S)')}
        </div>
        <div class="group">
          ${btn('undo', '↶', 'Undo', 'Undo (Cmd/Ctrl+Z, or say “undo that”)')}
          ${btn('recenter-all', '⌖', 'Recenter', "Zero every glove's orientation")}
        </div>
        <div class="group">
          ${btn('rotate-style', '⟳', 'Rotate: rate', 'FLY rotation: rate = tilt sets turn speed and keeps turning; absolute = camera follows the hand angle and stays there')}
          ${btn('sensitivity', '⚡', 'Sens 1×', 'Sensitivity multiplier on every hand-driven rate (B2 cycles it too)')}
        </div>
        <div class="group">
          ${btn('export', '⬇', 'STL', 'Export everything built as one STL (mm)')}
          <button id="help-toggle" title="Controls">?</button>
        </div>
      </header>
      <div id="modes"></div>
      <div id="gloves"></div>
      <div id="dock" class="panel">
        <button id="voice" title="X2D voice assistant: say “X2D” or click to talk; click again to hang up"><i>🎙</i><span class="lbl">X2D</span></button>
        <form id="ask" title="Ask Gemini to build or change something, or ask about the scene"><input id="ask-q" type="text" placeholder="✨ Ask Gemini: “make me a stickman”…" autocomplete="off" /></form>
      </div>
      <div id="help" class="panel" hidden>
        <b>Glove</b> B0 next mode (previous: click a mode chip, Shift+Tab) · B1 action · B2 sensitivity (size in BUILD) · B3 (pinky) reset view + zero<br/>
        <b>FLY</b> B1 alternates MOVE X / ROTATE / MOVE Y / ROTATE / MOVE Z … · roll turns, pitch looks<br/>
        <b>Simulator</b> <kbd>←→</kbd> roll <kbd>↑↓</kbd> pitch <kbd>Q</kbd><kbd>E</kbd> yaw · drag to tilt · <kbd>1</kbd>–<kbd>4</kbd> = B0–B3<br/>
        <b>Keys</b> <kbd>Tab</kbd> next mode · <kbd>R</kbd> recenter · <kbd>⌘Z</kbd> undo · <kbd>⌘S</kbd> save<br/>
        <a href="/controls.html" target="_blank" rel="noopener">▶ Animated guide to the glove buttons</a>
      </div>
      <div id="toast"></div>
    `;
    const help = root.querySelector<HTMLElement>('#help')!;
    root.querySelector<HTMLButtonElement>('#help-toggle')!.onclick = () => { help.hidden = !help.hidden; };
    root.querySelector<HTMLButtonElement>('#project-chip')!.onclick = () => actions.openProjects();
    this.toastEl = root.querySelector('#toast')!;
    root.querySelector<HTMLButtonElement>('#undo')!.onclick = () => actions.undo();
    root.querySelector<HTMLButtonElement>('#recenter-all')!.onclick = () => gloves.gloves.forEach((g) => actions.recenter(g.gloveId));
    root.querySelector<HTMLButtonElement>('#export')!.onclick = () => actions.exportSTL();
    root.querySelector<HTMLButtonElement>('#projects')!.onclick = () => actions.openProjects();
    root.querySelector<HTMLButtonElement>('#save')!.onclick = () => actions.saveProject();
    this.projectEl = root.querySelector<HTMLElement>('#project-name')!;
    this.rotateBtn = root.querySelector<HTMLButtonElement>('#rotate-style')!;
    this.rotateBtn.onclick = () => actions.toggleRotateStyle();
    this.syncRotateButton();
    this.sensBtn = root.querySelector<HTMLButtonElement>('#sensitivity')!;
    this.sensBtn.onclick = () => actions.cycleSensitivity();
    this.syncSensitivityButton();
    this.voiceBtn = root.querySelector<HTMLButtonElement>('#voice')!;
    this.voiceBtn.onclick = () => actions.toggleVoice();
    const askForm = root.querySelector<HTMLFormElement>('#ask')!;
    const askInput = root.querySelector<HTMLInputElement>('#ask-q')!;
    askForm.onsubmit = (e) => { e.preventDefault(); actions.askGemini(askInput.value); askInput.value = ''; askInput.blur(); };

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
        <div class="buttons" title="Glove pins: click to change what a pin does (Shift-click goes back). Lights up while pressed."></div><div class="layouts" title="Button layouts (also by voice: \"X2D, backup V2\")"></div>
        <div class="modes" title="Click a mode (same as tapping B0)">${MODE_ORDER.map((m) => `<i data-mode="${m}" style="--mode:${MODE_COLORS[m]}">${m}</i>`).join('')}</div>
        <div class="shapes" title="BUILD shape and size: click to choose (B2 cycles the size)"><span>SHAPE</span>${BUILD.primitives.map((p) => `<i data-shape="${p}">${p}</i>`).join('')}<span class="gap">SIZE</span>${BUILD.sizes.map((z) => `<i data-size="${z}">${z[0].toUpperCase()}</i>`).join('')}<b class="pos"></b></div>
        <div class="fly" title="FLY state: click, or press the pinky button (B1) to alternate ROTATE and a MOVE axis"><span>FLY</span><i data-axis="">ROTATE</i><i data-axis="X">X</i><i data-axis="Y">Y</i><i data-axis="Z">Z</i><b class="amt" title="move amount along the active axis (−1 … +1)"><u></u></b></div>
        <div class="actions">
          <button class="connect">Connect Glove</button>
          <button class="sim">Simulator</button>
          <button class="recenter">Recenter</button>
          <button class="disconnect" hidden>✕</button>
        </div>`;
      glovesEl.appendChild(panel);
      panel.querySelector<HTMLElement>('header')!.onclick = () => panel.classList.toggle('collapsed');

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
        buttons: [],
        buttonsRow: panel.querySelector('.buttons')!,
        layoutsRow: panel.querySelector('.layouts')!,
        pinVersion: null,
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
        shapeRow: panel.querySelector('.shapes')!,
        shapeChips: [...panel.querySelectorAll<HTMLElement>('.shapes i[data-shape]')],
        sizeChips: [...panel.querySelectorAll<HTMLElement>('.shapes i[data-size]')],
        pos: panel.querySelector('.shapes .pos')!,
      };
      p.shapeChips.forEach((chip) => (chip.onclick = () => actions.setPrimitive(g.gloveId, chip.dataset.shape as PrimitiveName)));
      p.sizeChips.forEach((chip) => { chip.title = chip.dataset.size!; chip.onclick = () => actions.setSize(g.gloveId, chip.dataset.size as SizeName); });
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

  /** Reflect the X2D assistant state on the toolbar button. */
  syncVoiceButton(state: VoiceState): void {
    const label = { off: '🎙 X2D', listening: '🎙 X2D · listening', connecting: '🎙 X2D · connecting…', talking: '🔴 X2D · talking', unsupported: '🎙 X2D (Chrome only)' }[state];
    this.voiceBtn.querySelector('.lbl')!.textContent = label.replace(/^\S+\s/, '');
    this.voiceBtn.querySelector('i')!.textContent = state === 'talking' ? '🔴' : '🎙';
    this.voiceBtn.classList.toggle('active', state === 'talking' || state === 'connecting');
    this.voiceBtn.disabled = state === 'unsupported';
  }

  /** (Re)build the pin chips and layout chips for a glove version (V1 has 4 pins, V2 has 7). */
  private buildPins(p: GlovePanel, v: GloveVersion): void {
    p.pinVersion = v;
    p.buttonsRow.innerHTML = pinsOf(v).map((pin) => `<i data-pin="${pin}"><b>${pin}</b><span></span></i>`).join('') + '<i class="reset-roles" title="Back to this glove\'s default layout">↺</i>';
    p.buttons = [...p.buttonsRow.querySelectorAll<HTMLElement>('i[data-pin]')];
    p.buttons.forEach((el) => {
      const pin = Number(el.dataset.pin);
      el.onclick = (e) => { cycleRole(v, pin, e.shiftKey ? -1 : 1); this.toast(`GPIO ${pin} → ${roleShort(roleOf(v, pin))}`); };
    });
    p.buttonsRow.querySelector<HTMLElement>('.reset-roles')!.onclick = () => { resetRoles(v); this.toast(`Glove V${v}: default layout`); };
    p.layoutsRow.innerHTML = `<span>V${v}</span>` + profilesFor(v).map((pr) => `<i data-profile="${pr.id}">${pr.name}</i>`).join('') + '<em class="custom">custom</em>';
    p.layoutsRow.querySelectorAll<HTMLElement>('i[data-profile]').forEach((el) => (el.onclick = () => { applyProfile(el.dataset.profile!); this.toast(`Layout: ${profileName(el.dataset.profile!)}`); }));
  }

  /** Reflect the current sensitivity on the toolbar button. */
  syncSensitivityButton(): void {
    this.sensBtn.querySelector('.lbl')!.textContent = `Sens ${RUNTIME.sensitivity}×`;
    this.sensBtn.classList.toggle('active', RUNTIME.sensitivity !== 1);
  }

  /** Reflect the current FLY rotation style on the toolbar button. */
  syncRotateButton(): void {
    const abs = FLY.rotate.style === 'absolute';
    this.rotateBtn.querySelector('.lbl')!.textContent = abs ? 'Rotate: absolute' : 'Rotate: rate';
    this.rotateBtn.classList.toggle('active', abs);
  }

  toast(msg: string, ms = 1400): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  /** Called every frame. */
  update(sessions: GloveSession[], width: number, height: number): void {
    sessions.forEach((s, i) => {
      const p = this.panels[i];
      const g = s.glove;
      const st = g.state;
      // Show the smoothed, recentred tilt (what FLY reads), not the post-deadzone state, so a
      // small tilt never reads as 0 while the camera is moving.
      p.rpy[0].textContent = fmt(g.tilt.roll);
      p.rpy[1].textContent = fmt(g.tilt.pitch);
      p.rpy[2].textContent = fmt(g.tilt.yaw);
      // Glove pins of the connected glove (V1 or V2): label = current job; lit while pressed
      // (real glove: the pin itself; simulator: its job).
      const v: GloveVersion = g.version ?? currentVersion();
      if (p.pinVersion !== v) this.buildPins(p, v);
      p.buttons.forEach((el) => {
        const pin = Number(el.dataset.pin);
        const r = roleOf(v, pin);
        const down = g.sourceKind === 'sim' ? r !== OFF && !!st.buttons[r] : pinDown(g.pinMask, v, pin);
        el.classList.toggle('down', down);
        el.classList.toggle('off', r === OFF);
        const span = el.querySelector('span')!;
        const txt = roleShort(r);
        if (span.textContent !== txt) { span.textContent = txt; el.title = `GPIO ${pin} (${PIN_PLACES[v][pin] ?? ''}): ${r === OFF ? 'off' : ROLES[r].label}. Click to change.`; }
      });
      const prof = profileOf(v);
      p.layoutsRow.querySelectorAll<HTMLElement>('i[data-profile]').forEach((el) => el.classList.toggle('on', el.dataset.profile === prof));
      p.layoutsRow.querySelector<HTMLElement>('.custom')!.style.display = prof === 'custom' ? '' : 'none';

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
      // A second glove that is not connected shrinks to its header and connect buttons.
      p.root.classList.toggle('idle', g.gloveId > 0 && !g.source);

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
      p.shapeRow.style.display = modeName === 'BUILD' || modeName === 'ERASE' ? '' : 'none';
      p.shapeChips.forEach((c) => c.classList.toggle('on', c.dataset.shape === s.primitive));
      p.sizeChips.forEach((c) => c.classList.toggle('on', c.dataset.size === s.size));
      if (s.ghost) p.pos.textContent = ghostInfo(s);
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
