import React, { useState } from 'react';
import axios from 'axios';

function Upload({ onUploadSuccess, onProcessing }) {
    const [selectedFile, setSelectedFile] = useState(null);

    const handleFileChange = (event) => {
        setSelectedFile(event.target.files[0]);
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            alert('Please select a file first!');
            return;
        }

        const formData = new FormData();
        formData.append('video', selectedFile);

        onProcessing();

        try {
            // Note: Axios automatically converts the JSON response string to an object
            const response = await axios.post('http://localhost:3000/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            onUploadSuccess(response.data.videoId, response.data.videoPath, response.data.analysis);
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('An error occurred during upload. Check the console for details.');
        }
    };

    return (
        <div>
            <input type="file" onChange={handleFileChange} accept="video/*" />
            <button onClick={handleUpload} disabled={!selectedFile}>
                Upload and Analyze Video
            </button>
        </div>
    );
}

export default Upload;

