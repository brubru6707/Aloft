import { BLE } from '../config';
import type { GloveSource, RawSample, SourceStatus } from './types';

/**
 * Web Bluetooth glove source using the Nordic UART Service.
 * Each notification carries ASCII text; lines are "roll,pitch,yaw,buttonsBitmask\n".
 * Notifications may split or merge lines, so we buffer and split on '\n'.
 */
export class BleSource implements GloveSource {
  readonly kind = 'ble' as const;
  name = 'BLE Glove';

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private buffer = '';
  private decoder = new TextDecoder();
  private sampleCb: ((s: RawSample) => void) | null = null;
  private statusCb: ((s: SourceStatus, d?: string) => void) | null = null;

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  onSample(cb: (s: RawSample) => void): void { this.sampleCb = cb; }
  onStatus(cb: (s: SourceStatus, d?: string) => void): void { this.statusCb = cb; }

  async connect(): Promise<void> {
    if (!BleSource.supported) {
      this.statusCb?.('error', 'Web Bluetooth not available (use Chrome, https or localhost)');
      throw new Error('Web Bluetooth unsupported');
    }
    this.statusCb?.('connecting', 'choose a device…');
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: BLE.namePrefix }, { services: [BLE.service] }],
        optionalServices: [BLE.service],
      });
      this.name = this.device.name ?? 'BLE Glove';
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      this.statusCb?.('connecting', `connecting to ${this.name}…`);
      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService(BLE.service);
      this.characteristic = await service.getCharacteristic(BLE.txCharacteristic);
      this.characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      await this.characteristic.startNotifications();
      this.buffer = '';
      this.reconnectAttempts = 0;
      this.statusCb?.('connected', this.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.statusCb?.(msg.includes('cancelled') || msg.includes('canceled') ? 'disconnected' : 'error', msg);
      this.cleanup();
      throw err;
    }
  }

  disconnect(): void {
    const dev = this.device;
    this.cleanup();
    if (dev?.gatt?.connected) dev.gatt.disconnect();
    this.statusCb?.('disconnected');
  }

  private cleanup(): void {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.characteristic = null;
    this.device = null;
  }

  private reconnectAttempts = 0;

  /** The glove dropped. Try to reconnect to the same device (no chooser) a few times. */
  private onDisconnected = async () => {
    const dev = this.device;
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
    this.characteristic = null;
    if (!dev || this.reconnectAttempts >= BLE.reconnectAttempts) {
      this.cleanup();
      this.statusCb?.('disconnected', 'glove disconnected');
      return;
    }
    this.reconnectAttempts++;
    this.statusCb?.('connecting', `reconnecting (${this.reconnectAttempts}/${BLE.reconnectAttempts})…`);
    await new Promise((r) => setTimeout(r, BLE.reconnectDelayMs));
    if (this.device !== dev) return; // disconnect() was called meanwhile
    try {
      const server = await dev.gatt!.connect();
      const service = await server.getPrimaryService(BLE.service);
      this.characteristic = await service.getCharacteristic(BLE.txCharacteristic);
      this.characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      await this.characteristic.startNotifications();
      this.buffer = '';
      this.reconnectAttempts = 0;
      this.statusCb?.('connected', this.name);
    } catch {
      this.onDisconnected();
    }
  };

  private onValue = (e: Event) => {
    const target = e.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    this.buffer += this.decoder.decode(value);
    // Guard against a runaway buffer if the glove never sends a newline.
    if (this.buffer.length > 512) this.buffer = this.buffer.slice(-256);
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) this.parseLine(line);
    }
  };

  private parseLine(line: string): void {
    const parts = line.split(',');
    if (parts.length < 4) return;
    const roll = parseFloat(parts[0]);
    const pitch = parseFloat(parts[1]);
    const yaw = parseFloat(parts[2]);
    const mask = parseInt(parts[3], 10);
    if (![roll, pitch, yaw, mask].every(Number.isFinite)) return;
    this.sampleCb?.({
      roll, pitch, yaw,
      buttons: [!!(mask & 1), !!(mask & 2), !!(mask & 4), !!(mask & 8)],
      timestamp: performance.now(),
    });
  }
}
