import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Absolute asset URLs: pages live at nested paths (/projects/leier).
  base: '/',
  plugins: [react()],
});
