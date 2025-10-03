const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { randomUUID } = require('crypto');
const VIDEO_PROCESSING_URL = process.env.VIDEO_PROCESSING_URL || 'http://localhost:5000';
const LANGUAGE_MODEL_URL = process.env.LANGUAGE_MODEL_URL || 'http://localhost:5001';
const app = express();
const PORT = 3001;
const Redis = require('ioredis');
const fetch = require('node-fetch');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.post('/upload', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const videoId = randomUUID();
    console.log('File uploaded:', req.file.path);

    const absoluteVideoPath = path.resolve(req.file.path);

    try {
        const [analysisResult, transcriptResult] = await Promise.all([
            processVideo(absoluteVideoPath),
            transcribeAudio(absoluteVideoPath)
        ]);

        const relativePath = path.basename(req.file.path);

        if (Array.isArray(analysisResult.scenes)) {
            await indexScenes(videoId, analysisResult.scenes);
        }

        analysisResult.videoId = videoId;

        res.json({
            videoId,
            videoPath: relativePath,
            analysis: analysisResult,
            transcript: transcriptResult.transcript
        });
    } catch (e) {
        console.error("Error processing video:", e);
        res.status(502).send("Failed to process video.");
    }
});

function processVideo(videoPath) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ video_path: videoPath });
        const processEndpoint = new URL('/process', VIDEO_PROCESSING_URL);

        const options = {
            hostname: processEndpoint.hostname,
            port: processEndpoint.port,
            path: processEndpoint.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const request = http.request(options, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        request.on('error', (e) => reject(e));
        request.write(postData);
        request.end();
    });
}

async function transcribeAudio(videoPath) {
    const response = await fetch(`${AUDIO_PROCESSING_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: videoPath })
    });

    if (!response.ok) {
        throw new Error(`Audio processing failed with status ${response.status}`);
    }

    return response.json();
}


// Serve the video file
// app.get('/videos/:filename', (req, res) => {
//     const filePath = path.join(__dirname, 'uploads', req.params.filename);
//      if (fs.existsSync(filePath)) {
//         res.sendFile(filePath);
//     } else {
//         res.status(404).send('File not found.');
//     }
// });

function tokenize(text) {
    if (!text) return [];
    const stop = new Set(['the','and','for','with','that','this','from','into','your','you','are','was','were','has','have','had','but','not','can','will','its','our','out','his','her','she','him','they','them','too','any','all','off','one','two','three','about','there','here','why','how','what','when','who','which','into','onto','under','over','the','a','an','of','to','in','on']);
    return [...new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 3 && !stop.has(t))
    )];
}

async function indexScenes(videoId, scenes) {
    const pipeline = redis.pipeline();
    pipeline.hset(`video:status:${videoId}`, { totalFrames: scenes.length, indexedFrames: 0 });

    scenes.forEach(scene => {
        const ts = typeof scene.timestamp === 'string'
            ? parseInt(scene.timestamp) || parseInt(scene.timestamp.replace(/\D/g,''),10)
            : scene.timestamp;

        const frameKey = `frame:${videoId}:${ts}`;
        pipeline.hset(frameKey, {
            videoId,
            timestamp: ts,
            description: scene.description
        });
        pipeline.rpush(`frames:list:${videoId}`, ts);

        const tokens = tokenize(scene.description);
        tokens.forEach(tok => pipeline.sadd(`idx:token:${tok}`, `${videoId}:${ts}`));
        pipeline.hincrby(`video:status:${videoId}`, 'indexedFrames', 1);
    });

    await pipeline.exec();
    console.log(`[index] video=${videoId} frames=${scenes.length}`);

    // Send to data-store for semantic indexing
    try {
        const response = await fetch(`${DATA_STORE_URL}/embeddings/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoId,
                frames: scenes.map(scene => ({
                    timestamp: typeof scene.timestamp === 'string' 
                        ? parseInt(scene.timestamp) || parseInt(scene.timestamp.replace(/\D/g,''),10)
                        : scene.timestamp,
                    description: scene.description
                }))
            })
        });

        if (response.ok) {
            console.log(`[semantic-index] video=${videoId} processed`);
        } else {
            console.error(`[semantic-index] failed for video=${videoId}: ${response.status}`);
        }
    } catch (error) {
        console.error(`[semantic-index] error for video=${videoId}:`, error.message);
    }
}

// Add semantic search endpoint
app.get('/semantic-search', async (req, res) => {
    const { videoId, q, k } = req.query;
    if (!videoId || !q) {
        return res.status(400).json({ error: 'videoId and q required' });
    }

    try {
        const response = await fetch(
            `${DATA_STORE_URL}/search/semantic?videoId=${encodeURIComponent(videoId)}&q=${encodeURIComponent(q)}&k=${k || 10}`
        );

        if (!response.ok) {
            throw new Error(`Data-store responded with ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Semantic search proxy error:', error);
        res.status(500).json({ error: 'Semantic search failed' });
    }
});


// Status endpoint
app.get('/video/:id/status', async (req, res) => {
    const vid = req.params.id;
    const status = await redis.hgetall(`video:status:${vid}`);
    if (!Object.keys(status).length) return res.status(404).json({ error: 'Not found' });
    res.json({
        videoId: vid,
        totalFrames: parseInt(status.totalFrames || 0),
        indexedFrames: parseInt(status.indexedFrames || 0),
        progress: status.totalFrames ? (parseInt(status.indexedFrames || 0) / parseInt(status.totalFrames || 1)) : 0
    });
});

// Search endpoint
app.get('/search', async (req, res) => {
    const { videoId, q } = req.query;
    if (!videoId || !q) return res.status(400).json({ error: 'videoId and q required' });

    const tokens = tokenize(q);
    if (!tokens.length) return res.json({ videoId, query: q, results: [] });

    const frameScores = new Map();
    for (const tok of tokens) {
        const members = await redis.smembers(`idx:token:${tok}`);
        members.filter(m => m.startsWith(`${videoId}:`)).forEach(m => {
            const ts = m.split(':')[1];
            frameScores.set(ts, (frameScores.get(ts) || 0) + 1);
        });
    }

    const scored = [...frameScores.entries()]
        .sort((a,b)=> b[1]-a[1] || parseInt(a[0])-parseInt(b[0]))
        .slice(0,25);

    const pipeline = redis.pipeline();
    scored.forEach(([ts]) => pipeline.hgetall(`frame:${videoId}:${ts}`));
    const raw = (await pipeline.exec()).map(r => r[1]);

    const results = raw.map((f,i)=>({
        timestamp: parseInt(f.timestamp),
        description: f.description,
        score: scored[i][1]
    }));

    res.json({ videoId, query: q, tokens, results });
});



app.listen(PORT, () => {
    console.log(`Video Ingestion Service listening on port ${PORT}`);
});