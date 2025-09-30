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

const app = express();
const PORT = 3000;

// This will proxy any request starting with /api to the video-ingestion-service
const apiProxy = createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // This removes the /api prefix before forwarding
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[API Gateway] Proxying request from ${req.originalUrl} to ${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('[API Gateway] Proxy error:', err);
    res.status(500).send('Proxy error');
  }
});

app.use('/api', apiProxy);

// The /videos proxy can remain as is
app.use('/videos', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
}));

app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});