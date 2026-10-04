import { defineConfig } from 'vite';

// Pages: the app (index.html), the glove test bench (test.html), the animated controls guide (controls.html) and the animated glove layouts (layouts.html).
export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', test: 'test.html', controls: 'controls.html', layouts: 'layouts.html' } } },
});
