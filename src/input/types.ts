/** Raw orientation + buttons as produced by a source (BLE glove or simulator). */
export interface RawSample {
  roll: number;   // degrees
  pitch: number;  // degrees
  yaw: number;    // degrees
  buttons: [boolean, boolean, boolean, boolean];
  timestamp: number; // performance.now()
}

/** Processed glove state emitted to the app. */
export interface GloveSample {
  gloveId: number;
  roll: number;
  pitch: number;
  yaw: number;
  buttons: [boolean, boolean, boolean, boolean];
}

export type SourceKind = 'ble' | 'sim';
export type SourceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** A thing that produces RawSamples. */
export interface GloveSource {
  readonly kind: SourceKind;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): void;
  onSample(cb: (s: RawSample) => void): void;
  onStatus(cb: (status: SourceStatus, detail?: string) => void): void;
}

export type ButtonEvent = { gloveId: number; button: number };

export interface GloveEvents {
  sample: GloveSample;
  tap: ButtonEvent;        // released within tapMaxMs
  holdstart: ButtonEvent;  // still held after tapMaxMs
  holdend: ButtonEvent;    // released after a hold
  press: ButtonEvent;      // raw down edge
  release: ButtonEvent;    // raw up edge
  status: { gloveId: number; status: SourceStatus; source: SourceKind | null; detail?: string };
}

export type Listener<T> = (e: T) => void;

/** Tiny typed event emitter. */
export class Emitter<Events extends object> {
  private map = new Map<keyof Events, Set<Listener<any>>>();
  on<K extends keyof Events>(type: K, cb: Listener<Events[K]>): () => void {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(cb);
    return () => this.map.get(type)?.delete(cb);
  }
  emit<K extends keyof Events>(type: K, e: Events[K]): void {
    this.map.get(type)?.forEach((cb) => cb(e));
  }
}
