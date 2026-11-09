import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import chatHandler from './api/chat.js';
import trackHandler from './api/track.js';
import weatherHandler from './api/weather.js';

dotenv.config();

const app = express();
// Cloud Run presets process.env.PORT=8080 where nginx reverse-proxy listens.
// The Node.js Express/Vite backend must listen on port 3000 (or CLI --port).
const args = process.argv.slice(2);
const portArgIndex = args.indexOf('--port');
const portFromArgs = portArgIndex !== -1 ? args[portArgIndex + 1] : undefined;
const PORT = Number(portFromArgs || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000));

app.use(express.json());

// Weather-Responsive Theme API Route (mirrors /api/weather Vercel Serverless Function)
app.get('/api/weather', async (req, res) => {
  try {
    await weatherHandler(req, res);
  } catch (error: any) {
    console.error('Server /api/weather error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error processing weather request.', fallback: true });
    }
  }
});

// Visitor Activity Tracking API Route (mirrors /api/track Vercel Serverless Function)
app.post('/api/track', async (req, res) => {
  try {
    await trackHandler(req, res);
  } catch (error: any) {
    console.error('Server /api/track error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error processing tracking event.', ok: false });
    }
  }
});

// Chat API Route (mirrors /api/chat Vercel Serverless Function)
app.post('/api/chat', async (req, res) => {
  try {
    await chatHandler(req, res);
  } catch (error: any) {
    console.error('Server /api/chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error processing chat request.',
        fallback: true
      });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  } else {
    // Development mode with Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
