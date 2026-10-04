/**
 * Small runtime gaps on Hermes that third-party code assumes exist.
 * Imported first from index.ts so it runs before anything else.
 */
type Perf = { clearMeasures?: (n?: string) => void; clearMarks?: (n?: string) => void };
const perf = (globalThis as { performance?: Perf }).performance;
if (perf) {
  // React's dev reconciler (bundled in @react-three/fiber) calls these for its performance tracks.
  if (typeof perf.clearMeasures !== 'function') perf.clearMeasures = () => {};
  if (typeof perf.clearMarks !== 'function') perf.clearMarks = () => {};
}
