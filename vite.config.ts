import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiPlugin } from './src/server/middleware';

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
});
