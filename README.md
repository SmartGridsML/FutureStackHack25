# FrameForge 👁️‍🗨️

FrameForge is an AI-powered video analysis and summarization tool. Upload a video, and the application will automatically analyze its scenes using a vision model and generate a concise summary using a large language model.

This project is built with a microservices architecture, consisting of a React frontend and several backend services for handling different parts of the workflow.

## Architecture

The application is composed of five main services:
* **Frontend:** A React application built with Vite that provides the user interface.
* **API Gateway:** An Express.js server that acts as a single entry point for the frontend, routing requests to the appropriate backend services.
* **Video Ingestion:** An Express.js service that handles file uploads and coordinates the processing workflow.
* **Video Processing:** A Python Flask service that uses **FFmpeg** to extract frames from the video and **Google's Gemini API** to analyze them.
* **Language Model:** A Python Flask service that uses the **Cerebras API** to generate a summary based on the scene descriptions.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

* **Node.js and npm:** (v18 or later recommended) - [Download Node.js](https://nodejs.org/)
* **Python:** (v3.9 or later recommended) - [Download Python](https://www.python.org/downloads/)
* **FFmpeg:** A command-line tool for handling video and audio.
    * **macOS (using Homebrew):** `brew install ffmpeg`
    * **Ubuntu/Debian:** `sudo apt update && sudo apt install ffmpeg`
    * **Windows:** Download from the [official FFmpeg website](https://ffmpeg.org/download.html) and add the `bin` directory to your system's PATH.

## Setup Instructions

Follow these steps to set up the project for local development.

### 1. Configure Environment Variables

The application requires API keys for the Google Gemini and Cerebras services.

* Copy the `.env.example` file to a new file named `.env` in the project's root directory.
* Open the new `.env` file and add your API keys.

```

# .env file

GOOGLE\_API\_KEY="YOUR\_GEMINI\_API\_KEY"
CEREBRAS\_API\_KEY="YOUR\_CEREBRAS\_API\_KEY"

````

### 2. Install Dependencies

You will need to install the dependencies for each service individually. Open a terminal for each of the following directories and run the specified commands.

* **Frontend:**
    ```
    cd frontend
    npm install
    ```

* **API Gateway:**
    ```
    cd services/api-gateway
    npm install
    ```

* **Video Ingestion:**
    ```
    cd services/video-ingestion
    npm install
    # Create the uploads directory and set permissions
    mkdir uploads
    chmod 777 uploads
    ```

* **Video Processing (Python):**
    ```
    cd services/video-processing
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```

* **Language Model (Python):**
    ```
    cd services/language-model
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```


## Running the Application Locally

To run the application, you must start each service in a **separate terminal window**. It is important to start the backend services first, in the correct order.

**Open 5 separate terminals.**

1.  **Terminal 1: Start the Language Model Service**
    ```
    cd services/language-model
    source venv/bin/activate # Activate the virtual environment
    flask run --host=0.0.0.0 --port=5001
    ```

2.  **Terminal 2: Start the Video Processing Service**
    ```
    cd services/video-processing
    source venv/bin/activate # Activate the virtual environment
    flask run --host=0.0.0.0 --port=5000
    ```

3.  **Terminal 3: Start the Video Ingestion Service**
    ```
    cd services/video-ingestion
    node server.js
    ```

4.  **Terminal 4: Start the API Gateway**
    ```
    cd services/api-gateway
    node server.js
    ```
    
5.  **Terminal 5: Start the Frontend**
    ```
    cd frontend
    npm run dev
    ```

Once all services are running, you can access the FrameForge application in your browser, typically at **http://localhost:5173**.
