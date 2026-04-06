import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function workerPanelEnvPlugin() {
  let env: Record<string, string> = {};
  return {
    name: 'worker-panel-env',
    configResolved(config) {
      env = loadEnv(config.mode, process.cwd(), '');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/worker-panel.html' || req.url === '/worker-panel') {
          const file = path.resolve(process.cwd(), 'public/worker-panel.html');
          if (!fs.existsSync(file)) return next();
          let html = fs.readFileSync(file, 'utf-8');
          html = html.replace('__VITE_SUPABASE_URL__', env.VITE_SUPABASE_URL ?? '');
          html = html.replace('__VITE_SUPABASE_ANON_KEY__', env.VITE_SUPABASE_ANON_KEY ?? '');
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }
        next();
      });
    },
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist');
      const file = path.join(outDir, 'worker-panel.html');
      if (!fs.existsSync(file)) return;
      let html = fs.readFileSync(file, 'utf-8');
      html = html.replace('__VITE_SUPABASE_URL__', env.VITE_SUPABASE_URL ?? '');
      html = html.replace('__VITE_SUPABASE_ANON_KEY__', env.VITE_SUPABASE_ANON_KEY ?? '');
      fs.writeFileSync(file, html);
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: ['sellbit-d66k.onrender.com'],
      },
      plugins: [tailwindcss(), react(), workerPanelEnvPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
