import { useState } from 'react';
import './App.css';
import Upload from './components/Upload';
import VideoContext from './components/VideoContext';
import AIAssistant from './components/AIAssistant';
import Player from './components/Player';

function App() {
  const [currentView, setCurrentView] = useState('upload'); // 'upload', 'analysis', 'editor'
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [videoAnalysis, setVideoAnalysis] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUpload = async (uploadResponse) => {
    console.log('Upload completed:', uploadResponse);
    setUploadedVideo(uploadResponse);
    setIsProcessing(true);
    
    try {
      // Start analysis
      setCurrentView('analysis');
      
      // Fetch video analysis
      const analysisResponse = await fetch(
        `${import.meta.env.VITE_API_BASE}/analysis/${uploadResponse.id}`
      );
      
      if (analysisResponse.ok) {
        const analysis = await analysisResponse.json();
        setVideoAnalysis(analysis);
        setCurrentView('editor');
      } else {
        console.error('Analysis failed');
        alert('Video analysis failed. Please try again.');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessing = (processing) => {
    setIsProcessing(processing);
  };

  const resetToUpload = () => {
    setCurrentView('upload');
    setUploadedVideo(null);
    setVideoAnalysis(null);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg"></div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                FrameForge
              </h1>
            </div>
            
            <nav className="flex items-center gap-6">
              <button
                onClick={resetToUpload}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'upload' 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Upload
              </button>
              <button
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'analysis' 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:text-gray-900'
                } ${!uploadedVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!uploadedVideo}
              >
                Analysis
              </button>
              <button
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'editor' 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:text-gray-900'
                } ${!videoAnalysis ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!videoAnalysis}
              >
                AI Editor
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentView === 'upload' && (
          <Upload 
            onUpload={handleUpload} 
            onProcessing={handleProcessing}
          />
        )}
        
        {currentView === 'analysis' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Analyzing Your Video
              </h2>
              {isProcessing ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600">Processing video content...</p>
                </div>
              ) : (
                <p className="text-gray-600">Analysis complete!</p>
              )}
            </div>
            
            {videoAnalysis && (
              <VideoContext 
                videoId={uploadedVideo?.id}
                analysis={videoAnalysis}
              />
            )}
          </div>
        )}
        
        {currentView === 'editor' && uploadedVideo && videoAnalysis && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <Player 
                videoUrl={uploadedVideo.url}
                videoId={uploadedVideo.id}
              />
              
              <div className="mt-6">
                <VideoContext 
                  videoId={uploadedVideo.id}
                  analysis={videoAnalysis}
                  compact={true}
                />
              </div>
            </div>
            
            <div className="lg:col-span-2">
              <AIAssistant 
                videoId={uploadedVideo.id}
                videoContext={videoAnalysis}
              />
            </div>
          </div>
        )}
      </main>

      {/* Loading Overlay */}
      {isProcessing && currentView === 'upload' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-sm mx-4 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-900 mb-2">
              Processing Video
            </p>
            <p className="text-gray-600">
              Analyzing content and preparing for editing...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;