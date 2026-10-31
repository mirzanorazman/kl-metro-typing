import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // The badge stylesheet travels inside a shared badge image, so tests need its text.
    css: { include: [/badges\.css/] },
  },
});
