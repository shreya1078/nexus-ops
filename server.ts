import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/api.ts';
import { getDatabase } from './src/server/db.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // Initialize SQLite database instance and ensure migrations are applied
  console.log('[Nexus Ops] Initializing relational database...');
  await getDatabase();
  console.log('[Nexus Ops] Relational database ready.');

  // JSON parsing middleware
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Mount API router
  app.use('/api', apiRouter);

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Mount Vite dev server in middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Nexus Ops] Operations Command Center running at http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('[Nexus Ops] Critical server startup error:', err);
  process.exit(1);
});
