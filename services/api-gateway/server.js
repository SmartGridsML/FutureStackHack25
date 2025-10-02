const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const cluster = require('cluster'); // Added for multi-core utilization
const os = require('os'); // Added for CPU detection

// Number of CPU cores to utilize
const numCPUs = os.cpus().length;

// Clustering for multi-core performance
if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running on ${numCPUs} cores`);
  
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  // Handle worker exit and restart
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });
} else {
  // Worker code - the actual Express app
  const VIDEO_INGESTION_URL = process.env.VIDEO_INGESTION_URL || 'http://video-ingestion:3001';
  const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'http://localhost:5173';

  const app = express();
  const PORT = 3000;

  // CORS configuration
  app.use(cors({
    origin: ALLOW_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Handle preflight requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Health check endpoint with worker ID for debugging
  app.get('/health', (_req, res) => res.json({ 
    status: 'ok', 
    upstream: VIDEO_INGESTION_URL,
    worker: process.pid 
  }));

  // Common proxy options
  const proxyOptions = {
    target: VIDEO_INGESTION_URL,
    changeOrigin: true,
    proxyTimeout: 120000, // 2 minutes
    timeout: 120000,
  };

  // Main API proxy - for /upload etc.
  app.use('/api', createProxyMiddleware({
    ...proxyOptions,
    pathRewrite: { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      console.log(`[Worker ${process.pid}] API: ${req.method} ${req.url} -> ${VIDEO_INGESTION_URL}${proxyReq.path}`);
    },
    onError: (err, req, res) => {
      console.error(`[Worker ${process.pid}] API error:`, err.message);
      if (!res.headersSent) res.status(502).json({ error: 'API service unavailable' });
    }
  }));

  app.use('/search', createProxyMiddleware({
    ...proxyOptions,
    pathRewrite: (path, req) => req.originalUrl,   // restore /search?...
    onProxyReq: (proxyReq, req) => {
      console.log(`[Worker ${process.pid}] Search: ${req.method} ${req.originalUrl} -> ${VIDEO_INGESTION_URL}${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req) => {
      console.log(`[Worker ${process.pid}] Search <- ${proxyRes.statusCode} ${req.originalUrl}`);
    }
  }));

//   app.use('/search', createProxyMiddleware({
//   target: VIDEO_INGESTION_URL, // This should be http://video-ingestion:3001
//   changeOrigin: true,
//   logLevel: 'debug',
//   onProxyReq: (proxyReq, req) => {
//     console.log(`[Gateway] Search request: ${req.url} -> ${VIDEO_INGESTION_URL}/search${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`);
//   },
//   onError: (err, req, res) => {
//     console.error(`[Gateway] Search error: ${err.message}`);
//     res.status(502).json({ error: 'Search service unavailable' });
//   }
// }));


  app.use('/video', createProxyMiddleware({
    ...proxyOptions,
    onProxyReq: (proxyReq, req) => {
      // Log the actual destination path that http-proxy-middleware will use
      console.log(`[Worker ${process.pid}] Video: ${req.method} ${req.originalUrl} -> ${VIDEO_INGESTION_URL}${proxyReq.path}`);
    },
    onError: (err, req, res) => {
      console.error(`[Worker ${process.pid}] Video error:`, err.message);
      if (!res.headersSent) res.status(502).json({ error: 'Video service unavailable' });
    }
  }));

  app.listen(PORT, () => {
    console.log(`Worker ${process.pid}: API Gateway listening on port ${PORT}`);
    console.log(`VIDEO_INGESTION_URL=${VIDEO_INGESTION_URL}`);
  });
}