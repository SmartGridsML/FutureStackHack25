// const express = require('express');
// const { createProxyMiddleware } = require('http-proxy-middleware');

// const app = express();
// const PORT = 3000;

// // app.use('/api/upload', createProxyMiddleware({ target: 'http://video-ingestion:3001', changeOrigin: true }));
// app.use('/api/upload', createProxyMiddleware({ target: 'http://localhost:3001', changeOrigin: true }));
// // app.use('/videos', createProxyMiddleware({ target: 'http://video-ingestion:3001', changeOrigin: true }));
// app.use('/videos', createProxyMiddleware({ target: 'http://localhost:3001', changeOrigin: true }));

// app.listen(PORT, () => {
//     console.log(`API Gateway listening on port ${PORT}`);
// });

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const VIDEO_INGESTION_URL = process.env.VIDEO_INGESTION_URL || 'http://video-ingestion:3001';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'http://localhost:5173';

const app = express();
const PORT = 3000;

// CORS configuration
app.use(cors({
  origin: ALLOW_ORIGIN,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Handle preflight requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok', upstream: VIDEO_INGESTION_URL }));

// Main API proxy
app.use('/api', createProxyMiddleware({
  target: VIDEO_INGESTION_URL,
  changeOrigin: true,
  pathRewrite: { '^/api': '' }
}));

app.use('/search', createProxyMiddleware({
  target: VIDEO_INGESTION_URL, // Should be http://video-ingestion:3001
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    console.log(`[Gateway] Proxying search request to: ${VIDEO_INGESTION_URL}/search`);
  },
  onError: (err, req, res) => {
    console.error('[Gateway] Search proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Search service unavailable' });
    }
  }
}));

// Add video status proxy
app.use('/video', createProxyMiddleware({
  target: VIDEO_INGESTION_URL,
  changeOrigin: true
}));

// Videos proxy for media files
app.use('/videos', createProxyMiddleware({
  target: VIDEO_INGESTION_URL,
  changeOrigin: true
}));

app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
  console.log(`VIDEO_INGESTION_URL=${VIDEO_INGESTION_URL}`);
});