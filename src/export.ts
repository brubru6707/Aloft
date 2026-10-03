import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

/** Export a group as binary STL to the cache folder and open the share sheet. Returns the mesh count. */
export async function exportSTL(group: THREE.Object3D, filename = 'aloft.stl'): Promise<number> {
  let count = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) count++; });
  if (count === 0) return 0;
  group.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const data = exporter.parse(group, { binary: true }) as unknown as DataView;
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
