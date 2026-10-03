import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { UNITS } from './config';

/**
 * Export a group as binary STL and trigger a download. Returns the number of meshes exported.
 * The world is in cm; STL is unitless but slicers assume mm, so the geometry is scaled by
 * UNITS.stlScale on the way out and a 2 cm cube arrives as a 20 mm cube.
 */
export function exportSTL(group: THREE.Object3D, filename = 'aloft.stl'): number {
  let count = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) count++; });
  if (count === 0) return 0;
  const saved = group.scale.clone();
  group.scale.multiplyScalar(UNITS.stlScale);
  group.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const data = exporter.parse(group, { binary: true }) as unknown as DataView<ArrayBuffer>;
  group.scale.copy(saved);
  group.updateMatrixWorld(true);
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return count;
}
