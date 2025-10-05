import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload as UploadIcon, Video } from 'lucide-react';

function Upload({ onUpload }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('video/')) {
      alert('Please select a valid video file.');
      return;
    }
    handleUpload(file);
  };

  const handleUpload = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE}/api/video-ingestion/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            setUploadProgress(progress);
          },
        }
      );
      if (response.data?.videoId) {
        onUpload(response.data);
      } else {
        throw new Error("Server response did not include a videoId.");
      }
    } catch (error) {
      console.error('Upload error:', error.response?.data || error.message);
      alert('Upload failed. Please try again.');
      setIsUploading(false);
    }
    // Note: onUpload will trigger a state change in App.jsx, unmounting this component
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };
  
  const commonDragProps = {
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); },
    onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); },
    onDrop: handleDrop,
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      <div 
        {...commonDragProps}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full max-w-2xl h-80 flex flex-col items-center justify-center 
          border-2 border-dashed rounded-2xl transition-all duration-300
          ${isDragging ? 'border-white bg-[hsl(var(--accent))] scale-105' : 'border-[hsl(var(--border))] hover:border-white'}
          ${isUploading ? 'pointer-events-none opacity-75' : 'cursor-pointer'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
          className="hidden"
        />
        {isUploading ? (
          <div className="text-center">
            <Video className="w-12 h-12 text-white mx-auto animate-pulse mb-4" />
            <p className="text-lg font-medium mb-2">Uploading...</p>
            <div className="w-64 bg-[hsl(var(--secondary))] rounded-full h-2.5">
              <div className="bg-white h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">{uploadProgress}%</p>
          </div>
        ) : (
          <div className="text-center text-[hsl(var(--muted-foreground))]">
            <UploadIcon className="w-12 h-12 mx-auto mb-4" />
            <p className="text-xl font-semibold text-white">
              Drop your video here
            </p>
            <p className="mt-2">or click to browse</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Upload;

