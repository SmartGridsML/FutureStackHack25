import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';
const COLLECTION = 'video_frames';
const VECTOR_SIZE = 768;

// Initialize Google AI client
let genAI = null;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (GOOGLE_API_KEY) {
  genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  console.log('Google AI client initialized');
} else {
  console.log('No GOOGLE_API_KEY provided, using hash-based embeddings');
}

// Helper function to generate UUID from string (deterministic)
function generateUUIDFromString(str) {
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  // Format as UUID v4
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
}

// Initialize Qdrant collection
async function initQdrant() {
  try {
    console.log(`Connecting to Qdrant at ${QDRANT_URL}`);
    const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    
    if (checkRes.status === 404) {
      console.log('Creating new collection...');
      const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { 
            size: VECTOR_SIZE, 
            distance: 'Cosine' 
          }
        })
      });
      
      if (!createRes.ok) {
        throw new Error(`Failed to create collection: ${await createRes.text()}`);
      }
      console.log('Qdrant collection created');
    } else if (checkRes.ok) {
      console.log('Qdrant collection exists');
    } else {
      throw new Error(`Failed to check collection: ${checkRes.status}`);
    }
  } catch (error) {
    console.error('Failed to initialize Qdrant:', error);
    console.log('Starting service without Qdrant (will retry connections on requests)');
  }
}

// Hash-based fallback embedding function
function getHashBasedEmbedding(text) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding = [];
  for (let i = 0; i < VECTOR_SIZE; i++) {
    const byteIndex = i % hash.length;
    embedding.push((hash[byteIndex] - 128) / 128);
  }
  return embedding;
}

// Updated embedding function using Google GenAI SDK
async function getEmbedding(text) {
  if (!genAI) {
    return getHashBasedEmbedding(text);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;
    
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response format');
    }
    
    console.log(`Generated embedding for text: "${text.slice(0, 50)}..." (${embedding.length} dimensions)`);
    return embedding;
  } catch (error) {
    console.error('Google AI embedding error, using fallback:', error.message);
    return getHashBasedEmbedding(text);
  }
}

// Upsert frame vectors to Qdrant with proper UUID point IDs
async function upsertFrameVectors(videoId, frames) {
  if (!frames.length) return;

  const points = frames.map(f => ({
    id: generateUUIDFromString(`${videoId}:${f.timestamp}`),
    vector: f.embedding,
    payload: {
      videoId,
      timestamp: f.timestamp,
      description: f.description,
      embedding_version: genAI ? 2 : 1, // Version 2 for real embeddings, 1 for hash-based
      frame_key: `${videoId}:${f.timestamp}`
    }
  }));

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Qdrant upsert failed: ${res.status} ${errorText}`);
  }
  
  console.log(`Upserted ${points.length} vectors for video ${videoId} (embedding_version: ${genAI ? 2 : 1})`);
}

// Semantic search in Qdrant
async function semanticSearch(videoId, queryEmbedding, k = 10) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: queryEmbedding,
      limit: k,
      with_payload: true,
      filter: {
        must: [
          { key: 'videoId', match: { value: videoId } }
        ]
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Semantic search failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return data.result.map(point => ({
    id: point.payload.frame_key || point.id,
    score: point.score,
    videoId: point.payload.videoId,
    timestamp: point.payload.timestamp,
    description: point.payload.description,
    embedding_version: point.payload.embedding_version || 1
  }));
}

// API Endpoints
app.post('/embeddings/batch', async (req, res) => {
  try {
    const { videoId, frames, transcript } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'videoId required' });
    }

    let items = [];
    let mode = "";

    if (Array.isArray(frames)) {
      items = frames.map(f => ({
        id: generateUUIDFromString(`${videoId}:frame:${f.timestamp}`),
        text: f.description,
        timestamp: f.timestamp,
        type: 'frame'
      }));
      mode = "frames";
    } else if (Array.isArray(transcript)) {
      items = transcript.map(s => ({
        id: generateUUIDFromString(`${videoId}:transcript:${s.index}`),
        text: s.text,
        start: s.start,
        end: s.end,
        type: 'transcript'
      }));
      mode = "transcript";
    } else {
      return res.status(400).json({ error: 'frames or transcript array required' });
    }

    console.log(`Processing embeddings for video ${videoId}, ${items.length} ${mode}`);

    // Generate embeddings
    const vectors = await Promise.all(
      items.map(async item => ({
        id: item.id,
        vector: await getEmbedding(item.text),
        payload: {
          videoId,
          type: item.type,
          text: item.text,
          timestamp: item.timestamp,
          start: item.start,
          end: item.end,
          embedding_version: genAI ? 2 : 1
        }
      }))
    );

    // Upsert into Qdrant
    const resQ = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: vectors })
    });

    if (!resQ.ok) {
      throw new Error(`Qdrant upsert failed: ${resQ.status} ${await resQ.text()}`);
    }

    res.json({
      status: 'ok',
      processed: vectors.length,
      type: mode,
      embedding_type: genAI ? 'google_ai' : 'hash_based'
    });

  } catch (error) {
    console.error('Embedding batch error:', error);
    res.status(500).json({ error: 'Failed to process embeddings', details: error.message });
  }
});


app.get('/search/semantic', async (req, res) => {
  try {
    const { videoId, q, k } = req.query;
    if (!videoId || !q) {
      return res.status(400).json({ error: 'videoId and q required' });
    }

    console.log(`Semantic search: videoId=${videoId}, query="${q}"`);
    
    const queryEmbedding = await getEmbedding(q);
    const results = await semanticSearch(videoId, queryEmbedding, parseInt(k || '10'));
    
    res.json({ 
      videoId, 
      query: q, 
      results,
      embedding_type: genAI ? 'google_ai' : 'hash_based'
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ error: 'Semantic search failed', details: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'data-store', 
    qdrant_url: QDRANT_URL,
    google_ai: !!genAI,
    embedding_type: genAI ? 'google_ai' : 'hash_based',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to test embeddings
app.post('/debug/embedding', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text required' });
    }
    
    const embedding = await getEmbedding(text);
    res.json({
      text,
      embedding_length: embedding.length,
      embedding_type: genAI ? 'google_ai' : 'hash_based',
      sample_values: embedding.slice(0, 5) // First 5 values for inspection
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4005;

app.listen(PORT, () => {
  console.log(`Data-store service starting on port ${PORT}`);
  console.log(`Qdrant URL: ${QDRANT_URL}`);
  console.log(`Google AI: ${genAI ? 'enabled' : 'disabled (using hash-based fallback)'}`);
  initQdrant();
});