const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { randomUUID } = require('crypto');
const VIDEO_PROCESSING_URL = process.env.VIDEO_PROCESSING_URL || 'http://localhost:5000';
const LANGUAGE_MODEL_URL = process.env.LANGUAGE_MODEL_URL || 'http://localhost:5001';
const DATA_STORE_URL = process.env.DATA_STORE_URL || 'http://data-store:4005';
const AUDIO_PROCESSING_URL = process.env.AUDIO_PROCESSING_URL || 'http://localhost:6000';

const app = express();
const PORT = 3001;
const Redis = require('ioredis');
const fetch = require('node-fetch');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Update Multer storage to use videoId
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/app/uploads'); // Ensure this matches the mounted volume
  },
  filename: (req, file, cb) => {
    // Generate or use provided videoId
    const videoId = req.body.videoId || generateVideoId(); // Implement generateVideoId if needed
    cb(null, `${videoId}.mp4`);
  }
});

const upload = multer({ storage });

app.post('/upload', upload.single('video'), async (req, res) => { // Changed to async
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const videoId = req.body.videoId || generateVideoId();
    const filePath = `/app/uploads/${req.file.filename}`;
    
    console.log(`📁 Video uploaded: ${filePath}`);

    // Await background processing before responding
    try {
        await processInBackground(videoId, filePath);

        res.status(200).json({
            videoId,
            videoPath: req.file.filename,
            status: 'Video uploaded and processed successfully'
        });
    } catch (error) {
        console.error(`[${videoId}] Error during processing:`, error);
        res.status(500).json({
            videoId,
            videoPath: req.file.filename,
            status: 'Video upload failed during processing',
            error: error.message
        });
    }
});

// Helper function to generate UUID if not provided
function generateVideoId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
        const errorBody = await response.text();
        throw new Error(`Audio processing failed with status ${response.status}: ${errorBody}`);
    }

    return response.json();
}


async function indexTranscript(videoId, segments) {
    const pipeline = redis.pipeline();
    pipeline.hset(`video:status:${videoId}`, { totalSentences: segments.length, indexedSentences: 0 });

    segments.forEach((segment, index) => {
        const { text, start, end } = segment;
        const sentenceKey = `transcript:${videoId}:${index}`;

        // Store transcript sentence in Redis
        pipeline.hset(sentenceKey, {
            videoId,
            text,
            start,
            end
        });

        // Maintain sentence list
        pipeline.rpush(`transcript:list:${videoId}`, index);

        // Tokenize transcript for keyword search
        const tokens = tokenize(text);
        tokens.forEach(tok => pipeline.sadd(`idx:token:${tok}`, `${videoId}:t${index}`));

        // Update progress
        pipeline.hincrby(`video:status:${videoId}`, 'indexedSentences', 1);
    });

    await pipeline.exec();
    console.log(`[transcript-index] video=${videoId} sentences=${segments.length}`);

    // ---- Send transcripts to semantic indexer ----
    try {
        const response = await fetch(`${DATA_STORE_URL}/embeddings/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoId,
                transcript: segments.map((s, idx) => ({
                    index: idx,
                    start: s.start,
                    end: s.end,
                    text: s.text
                }))
            })
        });

        if (response.ok) {
            console.log(`[semantic-index] transcript video=${videoId} processed`);
        } else {
            console.error(`[semantic-index] transcript failed for video=${videoId}: ${response.status}`);
        }
    } catch (error) {
        console.error(`[semantic-index] transcript error for video=${videoId}:`, error.message);
    }
}



// Serve the video file
app.get('/videos/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
     if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found.');
    }
});

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
        progress: status.totalFrames ? (parseInt(status.indexedFrames || 0) / parseInt(status.totalFrames || 1)) : 0,
        totalSentences: parseInt(status.totalSentences || 0),
        indexedSentences: parseInt(status.indexedSentences || 0),
        transcriptProgress: status.totalSentences ? (parseInt(status.indexedSentences || 0) / parseInt(status.totalSentences || 1)) : 0
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

// 🔧 FIX: Add this new endpoint to serve completed analysis data
app.get('/analysis/:id', async (req, res) => {
    const videoId = req.params.id;
    try {
        // Check the processing status in Redis
        const status = await redis.hgetall(`video:status:${videoId}`);
        
        // If processing is not complete, tell the client to keep polling
        if (!status.status || status.status !== 'completed') {
            return res.status(202).json({ status: status.status || 'processing', message: 'Analysis is not yet complete.' });
        }

        // Fetch all scene descriptions from Redis
        const frameKeys = await redis.lrange(`frames:list:${videoId}`, 0, -1);
        const scenePipeline = redis.pipeline();
        frameKeys.forEach(ts => scenePipeline.hgetall(`frame:${videoId}:${ts}`));
        const rawScenes = await scenePipeline.exec();
        const scenes = rawScenes.map(r => r[1]).filter(Boolean);

        // Fetch all transcript segments from Redis
        const segmentKeys = await redis.lrange(`transcript:list:${videoId}`, 0, -1);
        const transcriptPipeline = redis.pipeline();
        segmentKeys.forEach(idx => transcriptPipeline.hgetall(`transcript:${videoId}:${idx}`));
        const rawSegments = await transcriptPipeline.exec();
        const segments = rawSegments.map(r => r[1]).filter(Boolean);

        // Return the complete analysis object
        res.status(200).json({
            videoId,
            scenes,
            transcript: { segments }
        });

    } catch (error) {
        console.error(`[${videoId}] Error fetching analysis:`, error);
        res.status(500).json({ error: 'Failed to retrieve analysis data.' });
    }
});

// Also, ensure your background processor sets the 'completed' status
async function processInBackground(videoId, videoPath) {
    try {
        await redis.hset(`video:status:${videoId}`, { status: 'processing' });

        const [analysisResult, transcriptResult] = await Promise.all([
            processVideo(videoPath),
            transcribeAudio(videoPath)
        ]);

        if (Array.isArray(analysisResult.scenes)) {
            await indexScenes(videoId, analysisResult.scenes);
        }

        if (transcriptResult.transcript && Array.isArray(transcriptResult.transcript.segments)) {
            await indexTranscript(videoId, transcriptResult.transcript.segments);
        }
        
        console.log(`[${videoId}] Background processing finished.`);
        // Set status to 'completed' in Redis when done
        await redis.hset(`video:status:${videoId}`, { status: 'completed' });

    } catch (e) {
        console.error(`[${videoId}] Error during background processing:`, e);
        await redis.hset(`video:status:${videoId}`, { status: 'failed', error: e.message });
    }
}

app.listen(PORT, () => {
    console.log(`Video Ingestion Service listening on port ${PORT}`);
});