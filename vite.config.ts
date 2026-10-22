/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Supabase-klienten lastes dynamisk (services/supabase/client.ts) og skal ikke dras med i oppstarten, heller ikke i demoen.
          if (/node_modules\/@supabase\//.test(id)) return 'supabase';
          if (/recharts|d3-|victory|decimal\.js|eventemitter3|immer|redux|reselect/.test(id)) return 'diagram';
          if (/zod/.test(id)) return 'validering';
          if (/react|scheduler|lucide/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    env: { TZ: 'UTC' },
  },
});
