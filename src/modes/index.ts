import { MODE_ORDER, type ModeName } from '../config';
import { buildMode } from './build';
import { eraseMode } from './erase';
import { flyMode } from './fly';
import type { Mode } from './types';

const all: Mode[] = [flyMode, buildMode, eraseMode];
export const MODES: Mode[] = MODE_ORDER.map((name) => {
  const m = all.find((x) => x.name === name);
  if (!m) throw new Error(`No implementation for mode ${name}`);
  return m;
});

export function modeIndexOf(name: ModeName): number {
  return MODE_ORDER.indexOf(name);
}

export * from './types';
