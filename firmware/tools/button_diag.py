#!/usr/bin/env python3
"""
Button diagnostics for the Aloft glove (firmware built with -DBUTTON_DEBUG=1).

  capture  <port> <logfile> [--seconds N] [--stop-file PATH]
      Open the USB serial port (this resets the ESP32), wait for it to boot, and append
      every line it prints to the log with a host timestamp. Stops after N seconds or when
      the stop file appears.

  analyze  <logfile>
      Cross the raw GPIO edges (R lines) with the firmware's debounced edges (D lines) and the
      50 Hz frames (F lines) to say, per physical press: how long it was, how much it bounced,
      whether the 15 ms debounce accepted it, and whether it reached a frame. Also prints the
      loop-rate statistics (L lines) and BLE parameters (B lines).

Line formats (see glove.ino, BUTTON_DEBUG):
  R<idx> <level> <us>   raw GPIO edge from the interrupt, level 0 = pressed (pull-up)
  D<idx> <level> <us>   debounced edge from pollButtons(), same level convention
  F <us> <mask>         a frame was sent (mask = buttons bitmask, bit n = button n)
  L loops=.. mean_us=.. max_us=.. i2c_fail=.. notify_fail=.. raw_dropped=.. ble=.. <us>
  B ...                 BLE connect / params / mtu
"""
import argparse
import os
import re
import sys
import time
from collections import defaultdict

DEBOUNCE_MS = 15.0           # must match DEBOUNCE_MS in glove.ino
PRESS_GAP_MS = 40.0          # raw edges separated by a longer released period are different presses
NAMES = ['B0 (GPIO 13, mode)', 'B1 (GPIO 25, pinky)', 'B2 (GPIO 27)', 'B3 (GPIO 26)']


def capture(port: str, logfile: str, seconds: float, stop_file: str | None) -> None:
    import serial  # pyserial
    with serial.Serial(port, 115200, timeout=0.2) as ser, open(logfile, 'a', buffering=1) as out:
        t0 = time.monotonic()
        out.write(f'# capture start {time.strftime("%Y-%m-%d %H:%M:%S")} port={port}\n')
        print(f'capturing {port} -> {logfile} (max {seconds:.0f} s' + (f', stop file {stop_file}' if stop_file else '') + ')', flush=True)
        counts = defaultdict(int)
        last_report = t0
        while True:
            now = time.monotonic()
            if now - t0 > seconds or (stop_file and os.path.exists(stop_file)):
                break
            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode('ascii', errors='replace').rstrip('\r\n')
            out.write(f'{now - t0:10.4f} {line}\n')
            key = line[:1] if line[:1] in 'RDFLB' else ('frame' if ',' in line else 'other')
            counts[key] += 1
            if line.startswith('Advertising') or line.startswith('BUTTON_DEBUG') or line.startswith('B '):
                print(f'{now - t0:8.2f}s  {line}', flush=True)
            if now - last_report > 10:
                last_report = now
                print(f'{now - t0:8.2f}s  ' + '  '.join(f'{k}={v}' for k, v in sorted(counts.items())), flush=True)
        out.write(f'# capture end {time.strftime("%Y-%m-%d %H:%M:%S")}\n')
        print('done: ' + '  '.join(f'{k}={v}' for k, v in sorted(counts.items())), flush=True)


class Press:
    def __init__(self, idx: int, first_us: int):
        self.idx = idx
        self.edges: list[tuple[int, int]] = []   # (us, level)
        self.first_us = first_us
        self.last_us = first_us
        self.debounced_press_us: int | None = None
        self.debounced_release_us: int | None = None
        self.frames_with_bit = 0
        self.first_frame_us: int | None = None

    @property
    def duration_ms(self) -> float:
        return (self.last_us - self.first_us) / 1000.0

    def runs(self) -> list[tuple[int, int, int]]:
        """(level, start_us, end_us) for every stable run between edges."""
        out = []
        for (us, lvl), (nus, _) in zip(self.edges, self.edges[1:]):
            out.append((lvl, us, nus))
        return out

    def longest_low_run_ms(self) -> float:
        lows = [(e - s) for lvl, s, e in self.runs() if lvl == 0]
        return max(lows) / 1000.0 if lows else 0.0

    def settle_ms(self) -> tuple[float, float]:
        """Bounce time at make and at break: from the first edge until the last edge of each burst."""
        runs = self.runs()
        if not runs:
            return 0.0, 0.0
        # make: time from first_us until the start of the longest LOW run
        best = max(((e - s), s, e) for lvl, s, e in runs if lvl == 0) if any(l == 0 for l, _, _ in runs) else None
        if best is None:
            return self.duration_ms, 0.0
        _, s, e = best
        return (s - self.first_us) / 1000.0, (self.last_us - e) / 1000.0


def analyze(logfile: str) -> None:
    raw_edges: dict[int, list[tuple[int, int]]] = defaultdict(list)
    deb_edges: dict[int, list[tuple[int, int]]] = defaultdict(list)
    frames: list[tuple[int, int]] = []           # (us, mask)
    loops: list[dict] = []
    ble: list[str] = []
    boots = 0
    r_re = re.compile(r'^\s*[\d.]+\s+R(\d) (\d) (\d+)$')
    d_re = re.compile(r'^\s*[\d.]+\s+D(\d) (\d) (\d+)$')
    f_re = re.compile(r'^\s*[\d.]+\s+F (\d+) (\d+)$')
    l_re = re.compile(r'^\s*[\d.]+\s+L (.*) (\d+)$')
    b_re = re.compile(r'^\s*[\d.]+\s+(B .*)$')
    with open(logfile) as fh:
        for line in fh:
            if 'BUTTON_DEBUG on' in line:
                boots += 1
            m = r_re.match(line)
            if m:
                raw_edges[int(m[1])].append((int(m[3]), int(m[2]))); continue
            m = d_re.match(line)
            if m:
                deb_edges[int(m[1])].append((int(m[3]), int(m[2]))); continue
            m = f_re.match(line)
            if m:
                frames.append((int(m[1]), int(m[2]))); continue
            m = l_re.match(line)
            if m:
                loops.append(dict(kv.split('=') for kv in m[1].split())); continue
            m = b_re.match(line)
            if m:
                ble.append(m[1]); continue

    print(f'log: {logfile}')
    print(f'boots seen: {boots}   frames: {len(frames)}   loop-stat lines: {len(loops)}')
    if boots > 1:
        print('WARNING: more than one boot in this log; timestamps restart at each boot. Analyze one boot at a time.')
    print()

    # ---- loop rate
    if loops:
        n = [int(l['loops']) for l in loops]
        mean = [int(l['mean_us']) for l in loops]
        mx = [int(l['max_us']) for l in loops]
        print('LOOP RATE (one L line per second)')
        print(f'  loops/s: min {min(n)}  median {sorted(n)[len(n)//2]}  max {max(n)}')
        print(f'  mean loop time: {sum(mean)/len(mean):.0f} us   worst single loop over the whole run: {max(mx)} us')
        slow = [m for m in mx if m > 15000]
        print(f'  seconds with a loop longer than 15 ms (could swallow a tap entirely): {len(slow)} of {len(mx)}')
        print(f'  i2c failures: {loops[-1]["i2c_fail"]}   notify failures: {loops[-1]["notify_fail"]}   raw edges dropped: {loops[-1]["raw_dropped"]}')
        ble_secs = sum(1 for l in loops if l.get('ble') == '1')
        print(f'  seconds with a BLE client connected: {ble_secs} of {len(loops)}')
        if ble_secs:
            on = [int(l['loops']) for l in loops if l.get('ble') == '1']
            off = [int(l['loops']) for l in loops if l.get('ble') != '1']
            print(f'  loops/s with BLE connected: median {sorted(on)[len(on)//2]}' + (f'   without: median {sorted(off)[len(off)//2]}' if off else ''))
        print()
    if ble:
        print('BLE')
        for b in ble:
            print('  ' + b)
        print()

    # ---- frame timing
    if len(frames) > 2:
        gaps = [(b - a) / 1000.0 for (a, _), (b, _) in zip(frames, frames[1:])]
        print('FRAMES')
        print(f'  interval: min {min(gaps):.1f} ms  median {sorted(gaps)[len(gaps)//2]:.1f} ms  max {max(gaps):.1f} ms   (target 20 ms)')
        print(f'  frames later than 30 ms after the previous one: {sum(1 for g in gaps if g > 30)}')
        print()

    # ---- per button
    grand = {'presses': 0, 'no_debounce': 0, 'no_frame': 0, 'short_low': 0}
    for idx in range(4):
        edges = sorted(raw_edges.get(idx, []))
        presses: list[Press] = []
        cur: Press | None = None
        for us, lvl in edges:
            if cur is None:
                if lvl == 0:
                    cur = Press(idx, us); cur.edges.append((us, lvl))
                continue
            # a long released run ends the press
            if cur.edges[-1][1] == 1 and (us - cur.edges[-1][0]) > PRESS_GAP_MS * 1000:
                presses.append(cur); cur = None
                if lvl == 0:
                    cur = Press(idx, us); cur.edges.append((us, lvl))
                continue
            cur.edges.append((us, lvl)); cur.last_us = us
        if cur is not None:
            presses.append(cur)
        # trim: last_us should be the final edge to HIGH
        for p in presses:
            highs = [us for us, lvl in p.edges if lvl == 1]
            p.last_us = max(highs) if highs else p.edges[-1][0]

        # match debounced edges
        deb = sorted(deb_edges.get(idx, []))
        deb_presses = [us for us, lvl in deb if lvl == 0]
        deb_releases = [us for us, lvl in deb if lvl == 1]
        for p in presses:
            cands = [u for u in deb_presses if p.first_us - 1000 <= u <= p.last_us + 1000]
            if cands:
                p.debounced_press_us = cands[0]
            rel = [u for u in deb_releases if p.first_us <= u <= p.last_us + (DEBOUNCE_MS + 10) * 1000]
            if rel:
                p.debounced_release_us = rel[-1]
            # frames carrying the bit, between first edge and the frame after release
            for fus, mask in frames:
                if p.first_us - 1000 <= fus <= p.last_us + 45000 and (mask >> idx) & 1:
                    p.frames_with_bit += 1
                    if p.first_frame_us is None:
                        p.first_frame_us = fus
        stray_deb = [u for u in deb_presses if not any(p.first_us - 1000 <= u <= p.last_us + 1000 for p in presses)]

        print(f'{NAMES[idx]}: {len(presses)} physical presses, {len(deb_presses)} debounced presses, {len(stray_deb)} debounced presses with no raw edge nearby')
        if not presses:
            print()
            continue
        durs = sorted(p.duration_ms for p in presses)
        trans = sorted(len(p.edges) for p in presses)
        make = sorted(p.settle_ms()[0] for p in presses)
        brk = sorted(p.settle_ms()[1] for p in presses)
        print(f'  press duration ms: min {durs[0]:.0f}  median {durs[len(durs)//2]:.0f}  max {durs[-1]:.0f}')
        print(f'  raw edges per press: min {trans[0]}  median {trans[len(trans)//2]}  max {trans[-1]}   (2 = clean, no bounce)')
        print(f'  bounce at make ms: median {make[len(make)//2]:.2f}  max {make[-1]:.2f}    at break ms: median {brk[len(brk)//2]:.2f}  max {brk[-1]:.2f}')
        lat = [(p.debounced_press_us - p.first_us) / 1000.0 for p in presses if p.debounced_press_us is not None]
        if lat:
            print(f'  debounce latency ms (first raw edge -> debounced press): min {min(lat):.1f}  median {sorted(lat)[len(lat)//2]:.1f}  max {max(lat):.1f}')
        flat = [(p.first_frame_us - p.first_us) / 1000.0 for p in presses if p.first_frame_us is not None]
        if flat:
            print(f'  frame latency ms (first raw edge -> first frame with the bit): min {min(flat):.1f}  median {sorted(flat)[len(flat)//2]:.1f}  max {max(flat):.1f}')
        bad = []
        for i, p in enumerate(presses):
            flags = []
            if p.longest_low_run_ms() < DEBOUNCE_MS:
                flags.append(f'longest LOW run {p.longest_low_run_ms():.1f} ms < {DEBOUNCE_MS:.0f} ms debounce')
                grand['short_low'] += 1
            if p.debounced_press_us is None:
                flags.append('NO debounced press')
                grand['no_debounce'] += 1
            if p.frames_with_bit == 0:
                flags.append('NO frame carried the bit')
                grand['no_frame'] += 1
            if flags:
                bad.append((i, p, flags))
        grand['presses'] += len(presses)
        print(f'  presses lost before the frame: {len([b for b in bad if any("NO" in f for f in b[2])])}')
        for i, p, flags in bad:
            print(f'    #{i+1:2d} t={p.first_us/1e6:9.3f}s dur {p.duration_ms:6.1f} ms edges {len(p.edges):3d}: ' + '; '.join(flags))
        print('  every press: t(s) duration(ms) edges longest-LOW(ms) debounced frames-with-bit')
        for i, p in enumerate(presses):
            print(f'    #{i+1:2d} {p.first_us/1e6:9.3f} {p.duration_ms:7.1f} {len(p.edges):4d} {p.longest_low_run_ms():7.1f}   '
                  f'{"yes" if p.debounced_press_us is not None else "NO "}   {p.frames_with_bit}')
        print()

    # idle noise: edges while no press (would indicate a weak pull-up / noise pickup)
    print('SUMMARY')
    print(f'  physical presses seen on the GPIO: {grand["presses"]}')
    print(f'  presses whose longest LOW run was shorter than the {DEBOUNCE_MS:.0f} ms debounce: {grand["short_low"]}')
    print(f'  presses with no debounced press in the firmware: {grand["no_debounce"]}')
    print(f'  presses that never reached a frame bitmask: {grand["no_frame"]}')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('capture'); c.add_argument('port'); c.add_argument('logfile')
    c.add_argument('--seconds', type=float, default=900); c.add_argument('--stop-file', default=None)
    a = sub.add_parser('analyze'); a.add_argument('logfile')
    args = ap.parse_args()
    if args.cmd == 'capture':
        capture(args.port, args.logfile, args.seconds, args.stop_file)
    else:
        analyze(args.logfile)


if __name__ == '__main__':
    main()
