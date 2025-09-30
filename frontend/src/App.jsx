import React, { useState, useRef } from 'react';
import './App.css';
import Upload from './components/Upload';
import Player from './components/Player';

function App() {
    const [videoUrl, setVideoUrl] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusText, setStatusText] = useState('');
    const playerRef = useRef(null);

    const handleUploadSuccess = (videoPath, analysis) => {
        setVideoUrl(`http://localhost:3000/videos/${videoPath}`);
        setAnalysisResult(analysis); // Already an object from axios
        setIsLoading(false);
        setStatusText('Analysis Complete!');
    };

    const handleProcessing = () => {
        setIsLoading(true);
        setStatusText('Uploading and processing video... this may take a moment.');
        setVideoUrl('');
        setAnalysisResult(null);
    };

    const handleSeek = (timestamp) => {
        const seconds = parseInt(timestamp, 10);
        if (playerRef.current) {
            playerRef.current.seekTo(seconds, 'seconds');
        }
    };

    return (
        <div className="container">
            <header className="app-header">
                <h1>FrameForge 👁️‍🗨️</h1>
                <p>Your AI-powered video analysis and summarization tool.</p>
            </header>
            <main>
                <div className="card">
                    <Upload onUploadSuccess={handleUploadSuccess} onProcessing={handleProcessing} />
                </div>

                {isLoading && (
                    <div className="card status-card">
                        <div className="loader"></div>
                        <p>{statusText}</p>
                    </div>
                )}

                {analysisResult && (
                    <div className="results-grid">
                        <div className="card video-card">
                            <h3>Video Player</h3>
                            {videoUrl && <Player videoUrl={videoUrl} playerRef={playerRef} />}
                        </div>
                        <div className="card summary-card">
                            <h3>AI Summary</h3>
                            <p>{analysisResult.summary}</p>
                        </div>
                        <div className="card scenes-card">
                            <h3>Detected Scenes</h3>
                            <ul>
                                {analysisResult.scenes.map((scene, index) => (
                                    <li key={index} onClick={() => handleSeek(scene.timestamp)}>
                                        <strong>{scene.timestamp}:</strong> {scene.description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;

