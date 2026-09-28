import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiPlugin } from './src/server/middleware';

export default defineConfig(({ mode }) => {
  // 把 .env 中服务端变量注入 process.env（dev 中间件读 process.env）；
  // 已存在的 shell 环境变量优先，.env 仅作兜底
  const env = loadEnv(mode, process.cwd(), 'LLM_');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
  };
});
