/** Screen rectangles (points, top-left origin) of each glove's view: one full view, or two halves
 *  when both gloves are connected (stacked in portrait, side by side in landscape). */
export interface ViewRect { x: number; y: number; w: number; h: number }
export function splitViews(split: boolean, W: number, H: number): ViewRect[] {
  if (!split) return [{ x: 0, y: 0, w: W, h: H }];
  if (H > W) { const h = Math.floor(H / 2); return [{ x: 0, y: 0, w: W, h }, { x: 0, y: h, w: W, h: H - h }]; }
  const w = Math.floor(W / 2);
  return [{ x: 0, y: 0, w, h: H }, { x: w, y: 0, w: W - w, h: H }];
}
