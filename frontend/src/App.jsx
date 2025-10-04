import React, { useState } from 'react';
import './App.css';
import Upload from './components/Upload';
import VideoContext from './components/VideoContext';
import AIAssistant from './components/AIAssistant';
import Player from './components/Player';
import { Loader2, Film } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState('upload'); // 'upload', 'processing', 'editor'
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [videoAnalysis, setVideoAnalysis] = useState(null);

  /**
   * This function is called when the upload is accepted by the server (202 response).
   * It triggers the polling mechanism to check for analysis completion.
   */
  const handleUpload = (uploadResponse) => {
    if (!uploadResponse || !uploadResponse.videoId) {
      console.error("Upload response is missing videoId:", uploadResponse);
      alert("Upload succeeded, but failed to get a video ID. Please try again.");
      return;
    }
    
    console.log('Upload accepted, now polling for analysis:', uploadResponse.videoId);
    setUploadedVideo(uploadResponse);
    setCurrentView('processing');
    pollForAnalysis(uploadResponse.videoId);
  };

  /**
   * Polls the backend until the video analysis is complete.
   * This is the key to "ensuring analysis is completed".
   */
  const pollForAnalysis = async (videoId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE}/api/analysis/${videoId}`);

      if (response.status === 200) { // 200 OK: Analysis is complete
        const analysisData = await response.json();
        console.log('Analysis complete:', analysisData);
        setVideoAnalysis(analysisData);
        setCurrentView('editor'); // Switch to the editor view
      } else if (response.status === 202) { // 202 Accepted: Still processing
        console.log('Analysis in progress, checking again in 3 seconds...');
        setTimeout(() => pollForAnalysis(videoId), 3000); // Poll again
      } else {
        throw new Error(`Analysis failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch analysis:', error);
      alert('Video analysis failed. Please try again.');
      setCurrentView('upload'); // Reset to upload view on failure
    }
  };

  const resetToUpload = () => {
    setCurrentView('upload');
    setUploadedVideo(null);
    setVideoAnalysis(null);
  };

  const renderContent = () => {
    switch (currentView) {
      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-700">
            <Loader2 className="w-16 h-16 animate-spin text-blue-600 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Analyzing Your Video...</h2>
            <p>The AI is detecting scenes, transcribing audio, and finding key moments.</p>
          </div>
        );
      
      case 'editor':
        return (
          <div className="flex h-screen bg-gray-100">
            <div className="flex-grow p-4">
              <Player videoUrl={`${import.meta.env.VITE_API_BASE}/videos/${uploadedVideo.videoPath}`} />
            </div>
            <div className="w-1/3 max-w-md h-full border-l border-gray-200">
              {/* The videoId is now guaranteed to be available here */}
              <AIAssistant 
                videoId={videoAnalysis.videoId} 
                videoContext={videoAnalysis} 
              />
            </div>
          </div>
        );

      case 'upload':
      default:
        return <Upload onUpload={handleUpload} />;
    }
  };

  return (
    <main className="h-screen bg-gray-50">
      {currentView !== 'upload' && (
         <button 
            onClick={resetToUpload} 
            className="absolute top-4 left-4 z-10 bg-white p-2 rounded-full shadow-md hover:bg-gray-100"
            title="Upload another video"
          >
           <Film className="w-5 h-5 text-gray-700" />
         </button>
      )}
      {renderContent()}
    </main>
  );
}

export default App;