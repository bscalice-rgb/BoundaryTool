import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Leaflet-Geoman's stylesheet carries base64 SVG icons for its own floating toolbar.
 * That toolbar is hidden — every tool is driven from the app's own toolbar instead —
 * so the icons are dead weight, and one of them is an inline SVG data URI that
 * lightningcss refuses to parse. Dropping the toolbar rules solves both at once.
 */
function stripGeomanToolbarCss(): Plugin {
  return {
    name: 'strip-geoman-toolbar-css',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('leaflet-geoman') || !id.split('?')[0].endsWith('.css')) return null;
      return { code: code.replace(/\.leaflet-pm-toolbar[^{}]*\{[^}]*\}/g, ''), map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripGeomanToolbarCss(), react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
