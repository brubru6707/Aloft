import { defineConfig } from 'vite';

// Three pages: the app (index.html), the glove test bench (test.html) and the animated controls guide (controls.html).
export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', test: 'test.html', controls: 'controls.html' } } },
});
