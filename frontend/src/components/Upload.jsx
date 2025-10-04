import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload as UploadIcon, Video, AlertCircle } from 'lucide-react';

function Upload({ onUpload, onProcessing }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file');
      return;
    }
    
    // Validate file size (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
      alert('File size must be less than 100MB');
      return;
    }

    handleUpload(file);
  };

  const handleUpload = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Call onProcessing callback if provided
      if (typeof onProcessing === 'function') {
        onProcessing(true);
      }

      const formData = new FormData();
      formData.append('video', file);

      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUploadProgress(progress);
        }
      };

      // Handle completion
      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          console.log('Upload successful:', response);
          
          if (typeof onUpload === 'function') {
            onUpload(response);
          }
        } else {
          console.error('Upload failed:', xhr.statusText);
          alert('Upload failed. Please try again.');
        }
        
        setIsUploading(false);
        setUploadProgress(0);
        
        if (typeof onProcessing === 'function') {
          onProcessing(false);
        }
      };

      // Handle errors
      xhr.onerror = () => {
        console.error('Upload error');
        alert('Upload failed. Please check your connection and try again.');
        setIsUploading(false);
        setUploadProgress(0);
        
        if (typeof onProcessing === 'function') {
          onProcessing(false);
        }
      };

      // Start upload
      xhr.open('POST', `${import.meta.env.VITE_API_BASE}/upload`);
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
      setIsUploading(false);
      setUploadProgress(0);
      
      if (typeof onProcessing === 'function') {
        onProcessing(false);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
        Upload Your Video
      </h1>
      
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-105' 
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
          ${isUploading ? 'pointer-events-none opacity-75' : 'cursor-pointer'}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileInput}
          className="hidden"
        />
        
        {isUploading ? (
          <div className="space-y-4">
            <Video className="w-16 h-16 text-blue-600 mx-auto animate-pulse" />
            <div>
              <p className="text-lg font-medium text-gray-900 mb-2">
                Uploading Video...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600">
                {Math.round(uploadProgress)}% complete
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <UploadIcon className="w-16 h-16 text-gray-400 mx-auto" />
            <div>
              <p className="text-xl font-semibold text-gray-900 mb-2">
                Drop your video here or click to browse
              </p>
              <p className="text-gray-600">
                Supports MP4, MOV, AVI files up to 100MB
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">What happens next?</p>
            <ul className="space-y-1">
              <li>• AI analyzes your video content and audio</li>
              <li>• Detects filler words, pauses, and key moments</li>
              <li>• Provides intelligent editing suggestions</li>
              <li>• Chat with AI to edit your video naturally</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Upload;

