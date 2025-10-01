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

const app = express();
const PORT = 3000;

// --- Middleware ---
app.use(cors({ origin: 'http://localhost:5173' }));

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'API Gateway' });
});

// --- API Proxy (Upload) ---
const apiProxy = createProxyMiddleware({
  target: 'http://video-ingestion:3001', // Use Docker service name consistently
  changeOrigin: true,
  pathRewrite: {
    '^/api/upload': '/upload', // Rewrite /api/upload to /upload
  },
  timeout: 120000, // 2 minute timeout for large files
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[API Gateway] Proxying API request from ${req.originalUrl} to http://video-ingestion:3001${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('[API Gateway] API Proxy Error:', err);
    res.status(502).send('Bad Gateway: Upload service unavailable');
  }
});

app.use('/api/upload', apiProxy);

// --- Videos Proxy ---
const videosProxy = createProxyMiddleware({
    target: 'http://video-ingestion:3001',
    changeOrigin: true,
    timeout: 30000, // 30 second timeout for video serving
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[API Gateway] Proxying video request from ${req.originalUrl} to http://video-ingestion:3001${proxyReq.path}`);
    },
    onError: (err, req, res) => {
        console.error('[API Gateway] Videos Proxy Error:', err);
        res.status(502).send('Bad Gateway: Could not retrieve video file.');
    }
});

app.use('/videos', videosProxy);

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway listening on port ${PORT}`);
});