/**
 * Glove jobs that are the same in every mode (shared by the web app and the phone app):
 *  - SENS: tap = sensitivity (FLY) or piece / eraser size (BUILD, ERASE);
 *          hold = reset everything (start view, roll / pitch / yaw zeroed, sensitivity reset).
 *  - OPTION: next shape (BUILD, ERASE) or next direction X → Y → Z (FLY).
 *  - FLY / BUILD / ERASE keys: switch to that mode; pressed again in it, do its action
 *    (FLY: toggle rotate / move, BUILD: place, ERASE: erase).
 * The app calls onGlovePress / onGloveRelease first and handles the button itself only
 * when they return false.
 */
import { FLY, MODE_BUTTONS, MODE_ORDER, SENSITIVITY, type FlyAxis, type ModeName } from '../config';
import { cycleSize, setPrimitive } from '../modes/build';
import { flyAxis, setFlyAxis } from '../modes/fly';
import { MODES } from '../modes/index';
import type { AppContext, GloveSession } from '../modes/types';
import { BTN } from './buttonMap';

export interface ActionHost {
  ctx: AppContext;
  setMode(s: GloveSession, index: number): void;
  /** Start view and roll / pitch / yaw zeroed (the RESET job). */
  resetView(): void;
  cycleSensitivity(): void;
  /** Sensitivity back to SENSITIVITY.holdResetLevel. */
  resetSensitivity(): void;
  toast(msg: string): void;
}

const sensHold = new WeakMap<GloveSession, { timer: ReturnType<typeof setTimeout>; fired: boolean }>();
const MODE_KEYS: Partial<Record<number, ModeName>> = { [BTN.FLY]: 'FLY', [BTN.BUILD]: 'BUILD', [BTN.ERASE]: 'ERASE' };

function modeName(s: GloveSession): ModeName { return MODE_ORDER[s.modeIndex]; }

function option(host: ActionHost, s: GloveSession): void {
  if (modeName(s) === 'FLY') {
    const cur = flyAxis(s) ?? (s.scratch.flyLastAxis as FlyAxis | null | undefined) ?? null;
    const i = cur ? FLY.axisOrder.indexOf(cur) : -1;
    const next = FLY.axisOrder[(i + 1) % FLY.axisOrder.length];
    setFlyAxis(s, next);
    host.toast(`Direction: ${next}`);
    return;
  }
  const next = host.ctx.objects.nextPrimitive(s.primitive);
  setPrimitive(s, host.ctx, next);
  host.toast(`Shape: ${next}`);
}

function modeKey(host: ActionHost, s: GloveSession, target: ModeName): void {
  const index = MODE_ORDER.indexOf(target);
  if (s.modeIndex !== index) { host.setMode(s, index); return; }
  if (target === 'FLY') {
    // Toggle ROTATE <-> MOVE along the last direction (chosen with OPTION).
    const axis = flyAxis(s);
    setFlyAxis(s, axis ? null : ((s.scratch.flyLastAxis as FlyAxis | null | undefined) ?? FLY.axisOrder[0]));
    return;
  }
  MODES[index].onPress?.(s, host.ctx, MODE_BUTTONS.primary);   // place / erase
}

export function onGlovePress(host: ActionHost, s: GloveSession, button: number): boolean {
  if (button === BTN.SENS) {
    const prev = sensHold.get(s);
    if (prev) clearTimeout(prev.timer);
    const entry = { fired: false, timer: setTimeout(() => {
      entry.fired = true;
      host.resetView();
      host.resetSensitivity();
      host.toast('Reset: start view, roll / pitch / yaw 0, sensitivity reset');
    }, SENSITIVITY.holdResetMs) };
    sensHold.set(s, entry);
    return true;
  }
  if (button === BTN.OPTION) { option(host, s); return true; }
  const target = MODE_KEYS[button];
  if (target) { modeKey(host, s, target); return true; }
  return false;
}

export function onGloveRelease(host: ActionHost, s: GloveSession, button: number): boolean {
  if (button !== BTN.SENS) return false;
  const entry = sensHold.get(s);
  sensHold.delete(s);
  if (!entry) return true;
  clearTimeout(entry.timer);
  if (entry.fired) return true;   // it was a hold: the reset already ran
  if (modeName(s) === 'FLY') host.cycleSensitivity();
  else cycleSize(s, host.ctx);
  return true;
}
