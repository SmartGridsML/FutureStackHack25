import React, { useState, useRef } from 'react';
import './App.css';
import Upload from './components/Upload';
import Player from './components/Player';

function App() {
    const [videoId, setVideoId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [videoUrl, setVideoUrl] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [searchType, setSearchType] = useState('lexical'); // Add this line
    const playerRef = useRef(null);

    // FIX: correct parameters (was using videoIdReturned undefined)
    const handleUploadSuccess = (videoIdReturned, videoPath, analysis) => {
        setVideoId(videoIdReturned);
        setVideoUrl(`http://localhost:3001/videos/${videoPath}`);
        setAnalysisResult(analysis);
        setIsLoading(false);
        setStatusText('Analysis Complete!');
    };

    const handleProcessing = () => {
        setIsLoading(true);
        setStatusText('Uploading and processing video... this may take a moment.');
        setVideoUrl('');
        setAnalysisResult(null);
        setSearchResults([]);
        setVideoId('');
    };

    const handleSeek = (timestamp) => {
        const seconds = parseInt(timestamp, 10);
        if (playerRef.current?.seekTo) {
            playerRef.current.seekTo(seconds, 'seconds');
        }
    };

    // Update the runSearch function
    async function runSearch() {
        if (!videoId || !searchQuery) return;
        
        const endpoint = searchType === 'semantic' ? 'semantic-search' : 'search';
        const r = await fetch(
            `http://localhost:3000/${endpoint}?videoId=${videoId}&q=${encodeURIComponent(searchQuery)}`
        );
        const data = await r.json();
        setSearchResults(data.results || []);
    }

    return (
        <div className="container">
            <header className="app-header">
                <h1>FrameForge 👁️‍🗨️</h1>
                <p>Your AI-powered video analysis and summarization tool.</p>
            </header>
            <main>
                {/* Upload UI now rendered */}
                <Upload onUploadSuccess={handleUploadSuccess} onProcessing={handleProcessing} />

                <div className="card">
                    <h3>Search Frames</h3>
                    <div style={{ marginBottom: '10px' }}>
                        <label>
                            <input
                                type="radio"
                                value="lexical"
                                checked={searchType === 'lexical'}
                                onChange={(e) => setSearchType(e.target.value)}
                            />
                            Keyword Search
                        </label>
                        <label style={{ marginLeft: '20px' }}>
                            <input
                                type="radio"
                                value="semantic"
                                checked={searchType === 'semantic'}
                                onChange={(e) => setSearchType(e.target.value)}
                            />
                            Semantic Search
                        </label>
                    </div>
                    <input
                        style={{ width: '70%' }}
                        placeholder={searchType === 'semantic' ? 
                            'Search e.g. "explain machine learning concepts"' : 
                            'Search e.g. "neural network"'
                        }
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <button onClick={runSearch} disabled={!videoId || !searchQuery}>
                        {searchType === 'semantic' ? 'Semantic Search' : 'Keyword Search'}
                    </button>
                    <ul>
                        {searchResults.map(r => (
                            <li key={r.timestamp} onClick={() => handleSeek(r.timestamp)}>
                                <strong>
                                    {r.timestamp}s 
                                    {searchType === 'semantic' ? 
                                        ` (similarity: ${(r.score * 100).toFixed(1)}%)` : 
                                        ` (score: ${r.score})`
                                    }
                                </strong> — {r.description.slice(0, 90)}...
                            </li>
                        ))}
                    </ul>
                </div>

                {isLoading && (
                    <div className="card status-card">
                        <div className="loader"></div>
                        <p>{statusText}</p>
                    </div>
                )}

                {analysisResult && (
                    <div className="results-grid">
                        <div className="card summary-card">
                            <h3>AI Summary</h3>
                            <p>{analysisResult.summary}</p>
                        </div>
                        <div className="card scenes-card">
                            <h3>Detected Scenes</h3>
                            <ul>
                                {analysisResult.scenes.map((scene, index) => (
                                    <li key={index} onClick={() => handleSeek(scene.timestamp)}>
                                        <strong>{scene.timestamp}s:</strong> {scene.description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {videoUrl && (
                    <Player
                        videoUrl={videoUrl}
                        playerRef={playerRef}
                        analysisData={analysisResult}
                        onProgress={(progress) => {
                            // console.log('Video progress:', progress.playedSeconds);
                        }}
                        onSeek={handleSeek}
                    />
                )}
            </main>
        </div>
    );
}

export default App;

