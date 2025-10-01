// const express = require('express');
// const multer = require('multer');
// const cors = require('cors');
// const path = require('path');
// const fs = require('fs');
// const http = require('http');

// const app = express();
// const PORT = 3001;

// // --- Middlewares ---
// // Allow requests from other origins (like your React app)
// app.use(cors());

// // Serve files from the 'uploads' directory at the '/videos' URL endpoint
// // This is the correct and only way you should be serving these files.
// app.use('/videos', express.static(path.join(__dirname, 'uploads')));


// // --- Multer Configuration for File Uploads ---
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         const dir = 'uploads/';
//         if (!fs.existsSync(dir)) {
//             fs.mkdirSync(dir);
//         }
//         cb(null, dir);
//     },
//     filename: function (req, file, cb) {
//         // Create a unique filename to avoid conflicts
//         cb(null, Date.now() + path.extname(file.originalname));
//     }
// });

// const upload = multer({ storage: storage });


// // --- API Route for Uploading and Processing ---
// app.post('/upload', upload.single('video'), (req, res) => {
//     if (!req.file) {
//         return res.status(400).send('No file uploaded.');
//     }
//     console.log('File uploaded:', req.file.path);

//     const absoluteVideoPath = path.resolve(req.file.path);

//     const postData = JSON.stringify({
//         'video_path': absoluteVideoPath
//     });

//     const options = {
//         hostname: 'localhost',
//         port: 5000,
//         path: '/process',
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//             'Content-Length': Buffer.byteLength(postData)
//         }
//     };

//     const request = http.request(options, (response) => {
//         let data = '';
//         response.on('data', (chunk) => {
//             data += chunk;
//         });
//         response.on('end', () => {
//             console.log('Analysis complete. Sending response to client.');
//             try {
//                 const analysisResult = JSON.parse(data);
//                 // The filename is all the frontend needs
//                 const videoFileName = path.basename(req.file.path);
//                 res.json({ videoPath: videoFileName, analysis: analysisResult });
//             } catch (e) {
//                 console.error("Error parsing analysis result:", e);
//                 res.status(500).send("Failed to parse analysis from processing service.");
//             }
//         });
//     });

//     request.on('error', (e) => {
//         console.error(`Problem with request to video-processing service: ${e.message}`);
//         res.status(500).send('Failed to process video');
//     });

//     request.write(postData);
//     request.end();
// });


// // --- REMOVED THE REDUNDANT ROUTE ---
// /*
// app.get('/videos/:filename', (req, res) => {
//     const filePath = path.join(__dirname, 'uploads', req.params.filename);
//      if (fs.existsSync(filePath)) {
//         res.sendFile(filePath);
//     } else {
//         res.status(404).send('File not found.');
//     }
// });
// */


// // --- Start Server ---
// app.listen(PORT, () => {
//     console.log(`Video Ingestion Service listening on port ${PORT}`);
// });

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

const app = express();
const PORT = 3001;

app.use(cors());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Range");
  next();
});


// --- Multer Configuration ---
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
const upload = multer({ storage });

// --- Upload Route ---
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    console.log('File uploaded:', req.file.path);

    const absoluteVideoPath = path.resolve(req.file.path);

    const postData = JSON.stringify({
        video_path: absoluteVideoPath
    });

    const options = {
        hostname: 'localhost',
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
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
            console.log('Analysis complete. Sending response to client.');
            try {
                const analysisResult = JSON.parse(data);
                const videoFileName = path.basename(req.file.path);
                res.json({ videoPath: videoFileName, analysis: analysisResult });
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

// --- Proper Video Streaming with Range support ---
app.get('/videos/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).send('File not found.');
        }

        const range = req.headers.range;
        if (!range) {
            // No range header → send entire file
            res.writeHead(200, {
                'Content-Length': stats.size,
                'Content-Type': 'video/mp4',
            });
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        // Parse Range header → e.g. "bytes=0-"
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        const chunkSize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
        });

        fileStream.pipe(res);
    });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Video Ingestion Service listening on port ${PORT}`);
});
