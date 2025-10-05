import React, { useState, useRef } from 'react';
import './App.css';
import Upload from './components/Upload';
import VideoContext from './components/VideoContext';
import AIAssistant from './components/AIAssistant';
import Player from './components/Player';
import { Loader2, Film, Zap } from 'lucide-react';

function App() {
  const [video, setVideo] = useState(null); // { videoId, videoPath }
  const [analysis, setAnalysis] = useState(null);
  const [editedVideoUrl, setEditedVideoUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const playerRef = useRef(null);
  const editedPlayerRef = useRef(null);

  const handleUpload = (uploadResponse) => {
    if (!uploadResponse?.videoId || !uploadResponse?.videoPath) {
      alert("Upload succeeded, but the server response was invalid. Please try again.");
      return;
    }
    setVideo(uploadResponse);
    setIsProcessing(true);
    pollForAnalysis(uploadResponse.videoId);
  };

  const pollForAnalysis = async (videoId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/analysis/${videoId}`);
      if (response.status === 200) {
        const analysisData = await response.json();
        setAnalysis(analysisData);
        setIsProcessing(false);
      } else if (response.status === 202) {
        setTimeout(() => pollForAnalysis(videoId), 3000);
      } else {
        throw new Error(`Analysis failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch analysis:', error);
      alert('Video analysis failed. Please try again.');
      resetState();
    }
  };
  
  const handleToolComplete = (toolResult) => {
    // This logic assumes your backend produces predictable filenames
    // You might need to adjust this based on the actual toolResult structure
    if (toolResult.output?.includes('highlights.mp4')) {
      setEditedVideoUrl(`${import.meta.env.VITE_API_BASE}/videos/${video.videoId}_highlights.mp4?t=${new Date().getTime()}`);
    } else if (toolResult.output?.includes('trimmed.mp4')) {
      setEditedVideoUrl(`${import.meta.env.VITE_API_BASE}/videos/${video.videoId}_trimmed.mp4?t=${new Date().getTime()}`);
    } else if (toolResult.output?.includes('enhanced.mp4')) {
      setEditedVideoUrl(`${import.meta.env.VITE_API_BASE}/videos/${video.videoId}_enhanced.mp4?t=${new Date().getTime()}`);
    }
  };

  const resetState = () => {
    setVideo(null);
    setAnalysis(null);
    setEditedVideoUrl(null);
    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-xl font-bold">FrameForge</h1>
        </div>
        {video && (
          <button
            onClick={resetState}
            className="px-4 py-2 text-sm bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--muted))] rounded-lg"
          >
            Upload New Video
          </button>
        )}
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col p-6 overflow-y-auto">
          {!video ? (
            <Upload onUpload={handleUpload} />
          ) : (
            <div className="w-full h-full flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                {/* Original Video Player */}
                <div className="flex flex-col">
                  <h2 className="text-lg font-semibold mb-3 text-[hsl(var(--muted-foreground))]">Original</h2>
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <Player 
                      playerRef={playerRef} 
                      videoUrl={`${import.meta.env.VITE_API_BASE}/videos/${video.videoPath}`} 
                    />
                  </div>
                </div>
                {/* Edited Video Player */}
                <div className="flex flex-col">
                  <h2 className="text-lg font-semibold mb-3 text-[hsl(var(--muted-foreground))]">AI Edited Version</h2>
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    {editedVideoUrl ? (
                      <Player playerRef={editedPlayerRef} videoUrl={editedVideoUrl} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                        <Film className="w-10 h-10 mb-2" />
                        <p>Your edited video will appear here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
        
        {/* Right Sidebar */}
        <aside className="w-[450px] border-l border-[hsl(var(--border))] flex flex-col flex-shrink-0">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
              <Loader2 className="w-12 h-12 animate-spin text-white mb-4" />
              <h2 className="text-xl font-semibold">Analyzing Your Video...</h2>
              <p>AI is working its magic.</p>
            </div>
          ) : analysis ? (
            <>
              <VideoContext videoId={video.videoId} analysisResult={analysis} />
              <AIAssistant 
                videoId={video.videoId}
                videoContext={{ ...analysis, filename: video.videoPath }}
                onToolComplete={handleToolComplete}
              />
            </>
          ) : (
             <div className="flex flex-col items-center justify-center h-full text-[hsl(var(--muted))] p-8 text-center">
              <Film className="w-12 h-12 mb-4" />
              <h2 className="text-xl font-semibold">Ready for Analysis</h2>
              <p>Upload a video to get started with the AI Editing Assistant.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;