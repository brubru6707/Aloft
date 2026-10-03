import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

/** Export a group as binary STL and trigger a download. Returns the number of meshes exported. */
export function exportSTL(group: THREE.Object3D, filename = 'aloft.stl'): number {
  let count = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) count++; });
  if (count === 0) return 0;
  group.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const data = exporter.parse(group, { binary: true }) as unknown as DataView<ArrayBuffer>;
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return count;
}
