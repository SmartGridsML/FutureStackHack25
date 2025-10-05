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
  // const VIDEO_INGESTION_URL = process.env.VIDEO_INGESTION_URL || 'http://video-ingestion:3001';
  const VIDEO_INGESTION_URL = 'http://video-ingestion:3001';

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
  // app.use((req, res, next) => {
  //   res.header('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  //   res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  //   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  //   if (req.method === 'OPTIONS') return res.sendStatus(204);
  //   next();
  // });

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
    // proxyTimeout: 120000, // 2 minutes
    // timeout: 120000,
  };
  // Add upload route


  //   app.use('/upload', createProxyMiddleware({
  //   target: VIDEO_INGESTION_URL,
  //   changeOrigin: true,
  //   onProxyReq: (proxyReq, req) => {
  //     console.log(`[Worker ${process.pid}] 🎬 Upload: ${req.method} ${req.url} -> ${VIDEO_INGESTION_URL}`);
  //   },
  //   onError: (err, req, res) => {
  //     console.error(`[Worker ${process.pid}] Upload proxy error:`, err.message);
  //     if (!res.headersSent) res.status(500).json({ error: 'Upload service unavailable' });
  //   }
  // }));

  // Also add video files serving route
  app.use('/videos', createProxyMiddleware({
    target: VIDEO_INGESTION_URL,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
      console.log(`[Worker ${process.pid}] 📹 Videos: ${req.method} ${req.url} -> video-ingestion:3001`);
    },
    onError: (err, req, res) => {
      console.error(`[Worker ${process.pid}] Videos proxy error:`, err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Video files unavailable' });
    }
  }));

  // Add analysis route for video processing results
  app.use('/analysis', createProxyMiddleware({
    target: VIDEO_INGESTION_URL,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
      // 🔧 FIX: Log the full URL path including videoId
      console.log(`@@@@@@[Worker ${process.pid}] 📊 Analysis: ${req.method} ${req.originalUrl} -> ${VIDEO_INGESTION_URL}${req.url}`);
      console.log(`[Worker ${process.pid}] 📊 Analysis VideoId: ${req.params.id || 'NOT_CAPTURED'}`);
      console.log(`[Worker ${process.pid}] 📊 Analysis Full Path: ${req.path}`);
    },
    onError: (err, req, res) => {
      console.error(`[Worker ${process.pid}] Analysis proxy error:`, err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Analysis service unavailable' });
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

  app.use('/semantic-search', createProxyMiddleware({
    ...proxyOptions,
    pathRewrite: (path, req) => req.originalUrl,
    onProxyReq: (proxyReq, req) => {
      console.log(`[Worker ${process.pid}] Semantic: ${req.method} ${req.originalUrl} -> ${VIDEO_INGESTION_URL}${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req) => {
      console.log(`[Worker ${process.pid}] Semantic <- ${proxyRes.statusCode} ${req.originalUrl}`);
    }
  }));

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
  app.use('/videos', createProxyMiddleware({
    target: 'http://video-ingestion:3001',
    changeOrigin: true,
  }));
  // AI Assistant routes
  app.use('/api/assistant', createProxyMiddleware({
    target: 'http://ai-assistant:5006',
    changeOrigin: true,
    pathRewrite: (path, req) => '/assistant' + path, // 🔧 ADD: Strip /api prefix
    onProxyReq: (proxyReq, req) => {
      // Match the logging style of other routes
      console.log(`[Worker ${process.pid}] 🤖 Assistant: ${req.method} ${req.originalUrl} -> http://ai-assistant:5006${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`[Worker ${process.pid}] 🤖 Assistant Response: ${proxyRes.statusCode} for ${req.originalUrl}`);
    },
    onError: (err, req, res) => {
      console.error(`[Worker ${process.pid}] Assistant proxy error:`, err.message);
      console.error(`[Worker ${process.pid}] Assistant error for URL:`, req.originalUrl);
      if (!res.headersSent) res.status(500).json({ error: 'AI Assistant service unavailable' });
    }
  }));


  app.use('/api/video-ingestion', createProxyMiddleware({
  target: 'http://video-ingestion:3001',
  changeOrigin: true,
  pathRewrite: { '^/api/video-ingestion': '' },
}));

  // Main API proxy - for /upload etc.
  app.use('/api', createProxyMiddleware({
    target: VIDEO_INGESTION_URL,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }, // Keep /api prefix to avoid conflicts
    onProxyReq: (proxyReq, req) => {
      console.log(`[Worker ${process.pid}] API: ${req.method} ${req.url} -> ${VIDEO_INGESTION_URL}${proxyReq.path}`);
    },
    onError: (err, req, res) => {
      console.error(`[Worker ${process.pid}] API error:`, err.message);
      if (!res.headersSent) res.status(502).json({ error: 'API service unavailable' });
    }
  }));

  app.listen(PORT, () => {
    console.log(`Worker ${process.pid}: API Gateway listening on port ${PORT}`);
    console.log(`VIDEO_INGESTION_URL=${VIDEO_INGESTION_URL}`);
  });
}