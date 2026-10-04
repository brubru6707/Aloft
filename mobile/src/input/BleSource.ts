import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type BleError, type Device, type Subscription } from 'react-native-ble-plx';
import { BLE, BUTTON_MAP } from '../config';
import type { GloveSource, RawSample, SourceStatus } from './types';

/** One BleManager for the app (creating several leaks native listeners). */
let manager: BleManager | null = null;
export function bleManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

/** Decode a base64 notification payload to a (ASCII) string. */
function decodeBase64(b64: string): string {
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === 'function') return g.atob(b64);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let buf = 0, bits = 0;
  for (const ch of b64.replace(/=+$/, '')) {
    const v = chars.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
  }
  return out;
}

async function requestAndroidPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const wanted = api >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  const denied = wanted.filter((p) => res[p] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length) throw new Error('Bluetooth permission denied');
}

function waitPoweredOn(m: BleManager, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let sub: Subscription | null = null;
    const timer = setTimeout(() => { sub?.remove(); reject(new Error('Bluetooth is off')); }, timeoutMs);
    sub = m.onStateChange((state) => {
      if (state === State.PoweredOn) { clearTimeout(timer); sub?.remove(); resolve(); }
      else if (state === State.Unauthorized) { clearTimeout(timer); sub?.remove(); reject(new Error('Bluetooth permission denied')); }
      else if (state === State.Unsupported) { clearTimeout(timer); sub?.remove(); reject(new Error('Bluetooth LE not supported')); }
    }, true);
  });
}

function isGlove(d: Device): boolean {
  const name = d.name ?? d.localName ?? '';
  if (name.startsWith(BLE.namePrefix)) return true;
  return (d.serviceUUIDs ?? []).some((u) => u.toLowerCase() === BLE.service);
}

/**
 * BLE glove source using the Nordic UART Service via react-native-ble-plx.
 * Each notification carries ASCII text; lines are "roll,pitch,yaw,buttonsBitmask\n".
 * Notifications may split or merge lines, so we buffer and split on '\n'.
 */
export class BleSource implements GloveSource {
  readonly kind = 'ble' as const;
  name = 'BLE Glove';

  private device: Device | null = null;
  private monitor: Subscription | null = null;
  private discSub: Subscription | null = null;
  private buffer = '';
  private sampleCb: ((s: RawSample) => void) | null = null;
  private statusCb: ((s: SourceStatus, d?: string) => void) | null = null;
  private reconnectAttempts = 0;
  private closed = false;

  onSample(cb: (s: RawSample) => void): void { this.sampleCb = cb; }
  onStatus(cb: (s: SourceStatus, d?: string) => void): void { this.statusCb = cb; }

  async connect(): Promise<void> {
    this.closed = false;
    const m = bleManager();
    try {
      this.statusCb?.('connecting', 'checking Bluetooth…');
      await requestAndroidPermissions();
      await waitPoweredOn(m, BLE.powerOnTimeoutMs);
      this.statusCb?.('connecting', `scanning for ${BLE.namePrefix}…`);
      const found = await this.scan(m);
      if (this.closed) return;
      this.name = found.name ?? found.localName ?? 'BLE Glove';
      this.statusCb?.('connecting', `connecting to ${this.name}…`);
      await this.attach(found);
      this.statusCb?.('connected', this.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.statusCb?.(this.closed ? 'disconnected' : 'error', msg);
      this.cleanup();
      throw err;
    }
  }

  /** Scan until a glove shows up (by name prefix or service UUID) or the timeout passes. */
  private scan(m: BleManager): Promise<Device> {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); m.stopDeviceScan().catch(() => {}); fn(); };
      const timer = setTimeout(() => finish(() => reject(new Error(`no ${BLE.namePrefix} glove found (is it on and not connected elsewhere?)`))), BLE.scanTimeoutMs);
      m.startDeviceScan(null, { allowDuplicates: false }, (err, d) => {
        if (err) return finish(() => reject(err));
        if (d && isGlove(d)) finish(() => resolve(d));
      });
    });
  }

  private async attach(dev: Device): Promise<void> {
    const connected = await dev.connect(Platform.OS === 'android' ? { requestMTU: BLE.requestMtu } : undefined);
    await connected.discoverAllServicesAndCharacteristics();
    if (this.closed) { connected.cancelConnection().catch(() => {}); return; }
    // The advertisement often carries no name on iOS; the connected device usually does.
    this.name = connected.name ?? connected.localName ?? this.name;
    this.device = connected;
    this.discSub = connected.onDisconnected(this.onDisconnected);
    this.buffer = '';
    this.monitor = connected.monitorCharacteristicForService(BLE.service, BLE.txCharacteristic, (err, ch) => {
      if (err || !ch?.value) return;
      this.onValue(ch.value);
    });
    this.reconnectAttempts = 0;
  }

  disconnect(): void {
    this.closed = true;
    const dev = this.device;
    this.cleanup();
    dev?.cancelConnection().catch(() => {});
    bleManager().stopDeviceScan().catch(() => {});
    this.statusCb?.('disconnected');
  }

  private cleanup(): void {
    this.monitor?.remove(); this.monitor = null;
    this.discSub?.remove(); this.discSub = null;
    this.device = null;
  }

  /** The glove dropped. Try to reconnect to the same device (no scan) a few times. */
  private onDisconnected = async (_err: BleError | null, dropped: Device) => {
    if (this.closed) return;
    const dev = this.device ?? dropped;
    this.monitor?.remove(); this.monitor = null;
    this.discSub?.remove(); this.discSub = null;
    if (this.reconnectAttempts >= BLE.reconnectAttempts) {
      this.cleanup();
      this.statusCb?.('disconnected', 'glove disconnected');
      return;
    }
    this.reconnectAttempts++;
    this.statusCb?.('connecting', `reconnecting (${this.reconnectAttempts}/${BLE.reconnectAttempts})…`);
    await new Promise((r) => setTimeout(r, BLE.reconnectDelayMs));
    if (this.closed) return;
    try {
      await this.attach(dev); // zeroes reconnectAttempts on success
      this.statusCb?.('connected', this.name);
    } catch {
      this.onDisconnected(null, dev);
    }
  };

  private onValue(b64: string): void {
    this.buffer += decodeBase64(b64);
    // Guard against a runaway buffer if the glove never sends a newline.
    if (this.buffer.length > 512) this.buffer = this.buffer.slice(-256);
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) this.parseLine(line);
    }
  }

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
      buttons: BUTTON_MAP.map((bit) => !!(mask & (1 << bit))) as [boolean, boolean, boolean, boolean],   // finger order
      timestamp: performance.now(),
    });
  }
}
