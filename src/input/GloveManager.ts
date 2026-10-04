import { GLOVE_COLORS, MAX_GLOVES } from '../config';
import { BleSource } from './BleSource';
import { GloveInput } from './GloveInput';
import { SimulatorSource } from './SimulatorSource';
import type { GloveEvents, Listener } from './types';

/** Owns the glove slots and routes connect/simulator/recenter requests. */
export class GloveManager {
  readonly gloves: GloveInput[] = [];

  constructor(private dragTarget: HTMLElement) {
    for (let i = 0; i < MAX_GLOVES; i++) this.gloves.push(new GloveInput(i));
  }

  color(gloveId: number): string { return GLOVE_COLORS[gloveId] ?? '#ffffff'; }

  /** Subscribe to an event on every glove. */
  onAll<K extends keyof GloveEvents>(type: K, cb: Listener<GloveEvents[K]>): void {
    this.gloves.forEach((g) => g.on(type, cb));
  }

  async connectBle(gloveId: number): Promise<void> {
    // "Connect" on a slot that already has a real glove adds the new glove to a free slot instead
    // of replacing it, so two gloves end up side by side (split view) whichever button was used.
    if (this.gloves[gloveId].sourceKind === 'ble' && this.gloves[gloveId].connected) {
      const free = this.gloves.findIndex((o) => !o.connected || o.sourceKind === 'sim');
      if (free >= 0) gloveId = free;
    }
    const g = this.gloves[gloveId];
    try {
      await g.attach(new BleSource());
    } catch {
      /* status already reported through the source */
    }
  }

  /** Toggle the keyboard/mouse simulator on a glove. Only one simulator can run at a time. */
  async toggleSimulator(gloveId: number): Promise<void> {
    const g = this.gloves[gloveId];
    if (g.sourceKind === 'sim') { g.detach(); return; }
    this.gloves.forEach((o) => { if (o !== g && o.sourceKind === 'sim') o.detach(); });
    await g.attach(new SimulatorSource(this.dragTarget));
  }

  disconnect(gloveId: number): void { this.gloves[gloveId].detach(); }
  recenter(gloveId: number): void { this.gloves[gloveId].recenter(); }
  recenterAll(): void { this.gloves.forEach((g) => g.recenter()); }
  get connected(): GloveInput[] { return this.gloves.filter((g) => g.connected); }
}
