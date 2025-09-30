const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

app.use('/api/upload', createProxyMiddleware({ target: 'http://video-ingestion:3001', changeOrigin: true }));
app.use('/videos', createProxyMiddleware({ target: 'http://video-ingestion:3001', changeOrigin: true }));

app.listen(PORT, () => {
    console.log(`API Gateway listening on port ${PORT}`);
});
