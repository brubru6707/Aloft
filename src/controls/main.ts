/**
 * /controls.html: an animated guide to the glove buttons. The page is split into four
 * quadrants (top-left B0, bottom-left B1, bottom-right B2, top-right B3). Each shows the
 * glove with that finger's button pressing on a loop, next to what the press does in Aloft.
 * Values come from config.ts so the guide stays in step with the app. The glove is drawn as
 * a right hand seen from the palm side.
 */
import { BUTTON_GPIO_ORDER, MODE_COLORS, MODE_ORDER, SENSITIVITY, BUILD } from './data';

const PRESS_EVERY_MS = 1800;   // one press per button per cycle
const PRESS_HOLD_MS = 260;

const FINGERS = ['index', 'middle', 'ring', 'pinky'];

/**
 * Right-hand glove, palm towards you: thumb on the right, then index, middle, ring and pinky
 * going left. A button sits near each fingertip; `active` is highlighted.
 */
function handSvg(active: number): string {
  // finger centre x, top y, height for index → pinky (index next to the thumb on the right)
  const f = [[136, 30, 92], [104, 18, 104], [72, 26, 96], [42, 48, 74]];
  const digits = f.map(([x, y, h], i) =>
    `<rect class="digit${i === active ? ' on' : ''}" x="${x - 13}" y="${y}" width="26" height="${h + 20}" rx="13" />`).join('');
  const btns = f.map(([x, y], i) =>
    `<circle class="ripple" data-ripple="${i}" cx="${x}" cy="${y + 20}" r="9" />` +
    `<circle class="btn${i === active ? ' on' : ''}" data-btn="${i}" cx="${x}" cy="${y + 20}" r="8" />` +
    `<text class="label${i === active ? ' on' : ''}" x="${x}" y="${y - 6}">B${i}</text>`).join('');
  return `<svg class="hand" viewBox="0 0 180 250" role="img" aria-label="Right-hand glove, palm side, ${FINGERS[active]} finger button highlighted">
    ${digits}
    <path class="palm" d="M154 120 Q154 104 140 104 L28 104 Q20 104 22 120 L30 205 Q34 236 68 238 L116 238 Q148 236 152 205 Z" />
    <rect class="palm" x="138" y="150" width="22" height="58" rx="11" transform="rotate(28 149 179)" />
    <text class="label" x="90" y="246">right hand · palm side</text>
    ${btns}
  </svg>`;
}

interface Quad { button: number; title: string; area: string; effect: string; note: string; onPress(step: number, el: HTMLElement): void }

const QUADS: Quad[] = [
  {
    button: 0, title: 'Next mode', area: '1 / 1',
    effect: `<div class="chips">${MODE_ORDER.map((m) => `<span class="chip" data-mode="${m}">${m}</span>`).join('')}</div>
             <div class="big" data-big></div><div class="sub">every press moves one mode along · tap a chip on screen to go back</div>`,
    note: 'Index finger. FLY moves you around, BUILD places pieces, ERASE deletes them.',
    onPress(step, el) {
      const m = MODE_ORDER[step % MODE_ORDER.length];
      el.querySelectorAll<HTMLElement>('.chip').forEach((c) => {
        const on = c.dataset.mode === m;
        c.classList.toggle('on', on);
        c.style.background = on ? MODE_COLORS[m] : '';
      });
      const big = el.querySelector<HTMLElement>('[data-big]')!;
      big.textContent = m; big.style.color = MODE_COLORS[m];
    },
  },
  {
    button: 1, title: 'Action', area: '2 / 1',
    effect: `<div class="big small" data-big style="color:${MODE_COLORS.FLY}"></div>
             <div class="sub" data-sub></div>
             <div class="stage"><div class="grid"></div><div class="piece" data-piece style="left:46%;opacity:0"></div></div>`,
    note: 'Middle finger. In FLY it switches between turning and moving along one axis; in BUILD it places a piece; in ERASE it deletes everything the red eraser touches.',
    onPress(step, el) {
      const flyCycle = ['ROTATE', 'MOVE: X', 'ROTATE', 'MOVE: Y', 'ROTATE', 'MOVE: Z'];
      const phase = step % 8;   // six FLY presses, then a place and a delete
      const big = el.querySelector<HTMLElement>('[data-big]')!;
      const sub = el.querySelector<HTMLElement>('[data-sub]')!;
      const piece = el.querySelector<HTMLElement>('[data-piece]')!;
      if (phase < 6) {
        big.textContent = `FLY · ${flyCycle[phase]}`; big.style.color = MODE_COLORS.FLY;
        sub.textContent = flyCycle[phase] === 'ROTATE' ? 'roll to turn, pitch to look' : `tilt to slide along ${flyCycle[phase].slice(-1)}`;
        piece.style.opacity = '0';
      } else if (phase === 6) {
        big.textContent = 'BUILD · place'; big.style.color = MODE_COLORS.BUILD;
        sub.textContent = 'drops the piece where the crosshair points';
        piece.style.opacity = '1';
      } else {
        big.textContent = 'ERASE · erase what the eraser touches'; big.style.color = MODE_COLORS.ERASE;
        sub.textContent = 'removes the piece in the crosshair';
        piece.style.opacity = '0';
      }
    },
  },
  {
    button: 2, title: 'Sensitivity', area: '2 / 2',
    effect: `<div class="big small" data-big></div>
             <div class="meter"><i data-meter></i></div>
             <div class="row"><div class="cube" data-cube></div><div class="sub" data-size></div></div>`,
    note: 'Ring finger. In FLY, every hand-driven speed (turn, look, move) is multiplied by the level, 1× down to 0× in steps of 0.2. In BUILD it changes the piece size, and in ERASE the eraser size.',
    onPress(step, el) {
      const levels = SENSITIVITY.levels;
      const level = levels[step % levels.length];
      el.querySelector<HTMLElement>('[data-big]')!.textContent = `⚡ Sens ${level}×`;
      el.querySelector<HTMLElement>('[data-meter]')!.style.width = `${(level / Math.max(...levels)) * 100}%`;
      const size = BUILD.sizes[step % BUILD.sizes.length];
      const px = 14 * BUILD.sizeScale[size] * 2;
      const cube = el.querySelector<HTMLElement>('[data-cube]')!;
      cube.style.width = cube.style.height = `${px}px`;
      el.querySelector<HTMLElement>('[data-size]')!.textContent = `in BUILD / ERASE: ${size} piece or eraser (${2 * BUILD.sizeScale[size]} cm piece)`;
    },
  },
  {
    button: 3, title: 'Reset view', area: '1 / 2',
    effect: `<div class="stage"><div class="grid"></div><div class="start" data-start></div><div class="cam" data-cam></div></div>
             <div class="rpy"><div><span>ROLL</span><b data-r></b></div><div><span>PITCH</span><b data-p></b></div><div><span>YAW</span><b data-y></b></div></div>`,
    note: 'Pinky. Flies you straight back to the start position and zeroes roll, pitch and yaw, wherever you have wandered off to.',
    onPress(step, el) {
      // Odd steps: wander off (random-ish place and angles). Even steps (the press): snap home and zero.
      const cam = el.querySelector<HTMLElement>('[data-cam]')!;
      const start = el.querySelector<HTMLElement>('[data-start]')!;
      start.style.left = 'calc(50% - 7px)'; start.style.top = '70%';
      const wander = step % 2 === 1;
      const spots = [[18, 22, -40], [72, 18, 55], [24, 58, 120], [80, 50, -95]];
      const [x, y, a] = spots[Math.floor(step / 2) % spots.length];
      cam.style.left = wander ? `${x}%` : 'calc(50% - 9px)';
      cam.style.top = wander ? `${y}%` : 'calc(70% - 4px)';
      cam.style.transform = `rotate(${wander ? a : 0}deg)`;
      const vals = wander ? [a / 4, -a / 6, a] : [0, 0, 0];
      (['r', 'p', 'y'] as const).forEach((k, i) => {
        const b = el.querySelector<HTMLElement>(`[data-${k}]`)!;
        b.textContent = `${vals[i] >= 0 ? '+' : ''}${Math.round(vals[i])}°`;
        b.classList.toggle('zero', !wander);
      });
    },
  },
];

const app = document.getElementById('app')!;
app.innerHTML = QUADS.map((q) => `
  <section class="quad ${q.area.startsWith('1') ? 'top' : 'bottom'} ${q.area.endsWith('1') ? 'left' : 'right'}" style="grid-area:${q.area}" data-quad="${q.button}">
    <header><span class="key">B${q.button}</span><span class="what">${q.title}</span>
      <span class="finger">${FINGERS[q.button]} finger · GPIO ${BUTTON_GPIO_ORDER[q.button]}</span></header>
    ${handSvg(q.button)}
    <div class="effect">${q.effect}</div>
    <p class="note">${q.note}</p>
  </section>`).join('') + `
  <div class="center"><h1>Aloft controls</h1><p>each quadrant shows one glove button</p><a href="/">← back to Aloft</a> <a href="/layouts.html">Glove layouts →</a></div>`;

// Animate: each quadrant presses its button once per cycle, staggered so they do not all fire together.
QUADS.forEach((q, i) => {
  const el = app.querySelector<HTMLElement>(`[data-quad="${q.button}"]`)!;
  const btn = el.querySelector<SVGElement>(`[data-btn="${q.button}"]`)!;
  const ripple = el.querySelector<SVGElement>(`[data-ripple="${q.button}"]`)!;
  let step = 0;
  q.onPress(step, el);
  const press = () => {
    // B3 alternates "wander off" and "press to reset": only the reset step is a real press.
    const isPress = q.button !== 3 || step % 2 === 1;
    step++;
    if (isPress) {
      btn.classList.add('press');
      ripple.classList.remove('go'); void (ripple as unknown as HTMLElement).getBoundingClientRect(); ripple.classList.add('go');
      setTimeout(() => btn.classList.remove('press'), PRESS_HOLD_MS);
    }
    q.onPress(step, el);
  };
  setTimeout(() => setInterval(press, PRESS_EVERY_MS), 250 + i * 380);
});
