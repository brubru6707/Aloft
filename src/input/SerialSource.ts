import { BUTTON_MAP } from '../config';
import type { GloveSource, RawSample, SourceStatus } from './types';

/** Minimal Web Serial typings (Chrome). */
interface SerialPortLike {
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}
interface SerialLike { requestPort(): Promise<SerialPortLike>; }

/**
 * USB serial glove source (Web Serial). The firmware echoes the same
 * "roll,pitch,yaw,buttonsBitmask\n" stream on USB at 115200, so this is a drop-in
 * alternative to BLE for bench testing: no pairing, and page reloads do not lose it
 * for long. Opening the port resets the ESP32 (DTR/RTS), so expect ~2 s of boot
 * and gyro calibration before data flows.
 */
export class SerialSource implements GloveSource {
  readonly kind = 'ble' as const; // treated like a hardware glove by GloveInput
  name = 'USB glove';
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private closing = false;
  private buffer = '';
  private decoder = new TextDecoder();
  private sampleCb: ((s: RawSample) => void) | null = null;
  private statusCb: ((s: SourceStatus, d?: string) => void) | null = null;

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  onSample(cb: (s: RawSample) => void): void { this.sampleCb = cb; }
  onStatus(cb: (s: SourceStatus, d?: string) => void): void { this.statusCb = cb; }

  async connect(): Promise<void> {
    if (!SerialSource.supported) {
      this.statusCb?.('error', 'Web Serial not available (use Chrome)');
      throw new Error('Web Serial unsupported');
    }
    this.statusCb?.('connecting', 'choose a port…');
    try {
      const serial = (navigator as unknown as { serial: SerialLike }).serial;
      this.port = await serial.requestPort();
      await this.port.open({ baudRate: 115200 });
      this.closing = false;
      this.statusCb?.('connected', 'USB serial');
      void this.readLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.statusCb?.(msg.includes('No port selected') ? 'disconnected' : 'error', msg);
      this.port = null;
      throw err;
    }
  }

  disconnect(): void {
    this.closing = true;
    this.reader?.cancel().catch(() => {});
    this.statusCb?.('disconnected');
  }

  private async readLoop(): Promise<void> {
    while (this.port?.readable && !this.closing) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.onBytes(value);
        }
      } catch {
        /* read error: fall through to close */
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
      if (!this.closing) break;
    }
    try { await this.port?.close(); } catch { /* ignore */ }
    this.port = null;
    if (!this.closing) this.statusCb?.('disconnected', 'USB serial closed');
  }

  private onBytes(bytes: Uint8Array): void {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    if (this.buffer.length > 4096) this.buffer = this.buffer.slice(-1024);
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) this.parseLine(line);
    }
  }

  private parseLine(line: string): void {
    const parts = line.split(',');
    if (parts.length < 4) return; // boot banner / calibration messages
    const roll = parseFloat(parts[0]);
    const pitch = parseFloat(parts[1]);
    const yaw = parseFloat(parts[2]);
    const mask = parseInt(parts[3], 10);
    if (![roll, pitch, yaw, mask].every(Number.isFinite)) return;
    this.sampleCb?.({
      roll, pitch, yaw,
      buttons: BUTTON_MAP.map((bit) => !!(mask & (1 << bit))) as [boolean, boolean, boolean, boolean],   // finger order
      timestamp: performance.now(),
    });
  }
}
