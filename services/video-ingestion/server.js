const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

const app = express();
const PORT = 3001;

app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    console.log('File uploaded:', req.file.path);

    // *** THIS IS THE FIX ***
    // Resolve the absolute path of the uploaded file
    const absoluteVideoPath = path.resolve(req.file.path);

    const postData = JSON.stringify({
        // Pass the absolute path to the video-processing service
        'video_path': absoluteVideoPath
    });

    const options = {
        hostname: 'localhost', // Corrected for local debugging
        port: 5000,
        path: '/process',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const request = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            console.log('Analysis complete. Sending response to client.');
            try {
                const analysisResult = JSON.parse(data);
                const relativePath = path.basename(req.file.path);
                res.json({ videoPath: relativePath, analysis: analysisResult });
            } catch (e) {
                console.error("Error parsing analysis result:", e);
                res.status(500).send("Failed to parse analysis from processing service.");
            }
        });
    });

    request.on('error', (e) => {
        console.error(`Problem with request to video-processing service: ${e.message}`);
        res.status(500).send('Failed to process video');
    });

    request.write(postData);
    request.end();
});

// Serve the video file
// app.get('/videos/:filename', (req, res) => {
//     const filePath = path.join(__dirname, 'uploads', req.params.filename);
//      if (fs.existsSync(filePath)) {
//         res.sendFile(filePath);
//     } else {
//         res.status(404).send('File not found.');
//     }
// });


app.listen(PORT, () => {
    console.log(`Video Ingestion Service listening on port ${PORT}`);
});