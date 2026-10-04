import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { UNITS } from './config';

/**
 * Export a group as binary STL to the cache folder and open the share sheet. Returns the mesh count.
 * The world is in cm; STL is unitless but slicers assume mm, so the geometry is scaled by
 * UNITS.stlScale on the way out and a 2 cm cube arrives as a 20 mm cube.
 */
export async function exportSTL(group: THREE.Object3D, filename = 'aloft.stl'): Promise<number> {
  let count = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) count++; });
  if (count === 0) return 0;
  const saved = group.scale.clone();
  group.scale.multiplyScalar(UNITS.stlScale);
  group.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const data = exporter.parse(group, { binary: true }) as unknown as DataView;
  group.scale.copy(saved);
  group.updateMatrixWorld(true);
  const bytes = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  const file = new File(Paths.cache, filename);
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'model/stl', UTI: 'public.standard-tesselated-geometry-format', dialogTitle: 'Export STL' });
  }
  return count;
}

/** Write a text file to the cache folder and open the share sheet. */
export async function shareText(text: string, filename: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: filename });
  }
}
