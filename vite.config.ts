import { defineConfig } from 'vite';

// Two pages: the app (index.html) and the glove test bench (test.html).
export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', test: 'test.html' } } },
});
