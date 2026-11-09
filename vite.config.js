import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const r = (p) => fileURLToPath(new URL(p, import.meta.url));
// base './' para que Electron cargue dist/ con file://. Páginas PC, móvil y widgets Windows.
export default defineConfig({
  base: './', plugins: [react()], server: { port: 5173, strictPort: true },
  build: { rollupOptions: { input: { main: r('./index.html'), mobile: r('./mobile.html'), widgets: r('./widgets.html') } } }
});
