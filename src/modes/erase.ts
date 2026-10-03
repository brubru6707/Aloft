import { MODE_BUTTONS } from '../config';
import type { Mode } from './types';

export const eraseMode: Mode = {
  name: 'ERASE',
  update() { /* hover highlight is handled by the app */ },
  // Act on the press edge so it works no matter how long the button is held.
  onPress(s, ctx, button) {
    if (button !== MODE_BUTTONS.primary || !s.hit) return;
    const mesh = s.hit;
    const { parent } = ctx.objects.remove(mesh);
    s.hit = null;
    ctx.undo.push({ label: `erase ${mesh.name}`, undo: () => ctx.objects.restore(mesh, parent) });
    ctx.toast(`Erased ${mesh.name}`);
  },
};
