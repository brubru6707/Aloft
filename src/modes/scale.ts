import { INPUT, MODE_BUTTONS, SCALE } from '../config';
import { commitTransform, snapshot, type Mode, type TransformSnapshot } from './types';

/** SCALE: pitch up/down scales the selection; tap B1 selects. */
export const scaleMode: Mode = {
  name: 'SCALE',
  update(s, ctx, dt) {
    const sel = ctx.objects.selection;
    if (!sel) return;
    const pitch = s.glove.state.pitch / INPUT.maxTiltDeg;
    if (pitch !== 0) {
      if (!s.scratch.scale) s.scratch.scale = snapshot(sel);
      const f = Math.exp(pitch * SCALE.ratePerSec * dt);
      const next = sel.scale.x * f;
      if (next >= SCALE.min && next <= SCALE.max) {
        const before = sel.scale.x;
        sel.scale.multiplyScalar(f);
        // Keep objects sitting on the ground when they grow/shrink.
        if (sel.userData.built) sel.position.y += (sel.scale.x - before) * (sel.userData.halfHeight ?? 1);
      }
    } else if (s.scratch.scale) {
      commitTransform(s.scratch.scale as TransformSnapshot, 'scale', ctx.undo);
      delete s.scratch.scale;
    }
  },
  // Act on the press edge so it works no matter how long the button is held.
  onPress(s, ctx, button) {
    if (button === MODE_BUTTONS.primary && s.hit) {
      ctx.objects.select(s.hit);
      ctx.toast(`Selected ${s.hit.name}`);
    }
  },
  exit(s, ctx) {
    commitTransform(s.scratch.scale as TransformSnapshot | undefined, 'scale', ctx.undo);
    delete s.scratch.scale;
  },
};
