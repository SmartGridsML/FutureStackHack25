# FrameForge 👁️‍🗨️

FrameForge is an AI-powered video analysis and summarization tool. Upload a video, and the application will automatically analyze its scenes using a vision model and generate a concise summary using a large language model.

This project is built with a microservices architecture, consisting of a React frontend and several backend services for handling different parts of the workflow.

---

## Architecture

The application is composed of five main services:
* **Frontend:** A React application built with Vite that provides the user interface.
* **API Gateway:** An Express.js server that acts as a single entry point for the frontend, routing requests to the appropriate backend services.
* **Video Ingestion:** An Express.js service that handles file uploads and coordinates the processing workflow.
* **Video Processing:** A Python Flask service that uses **FFmpeg** to extract frames from the video and **Google's Gemini API** to analyze them.
* **Language Model:** A Python Flask service that uses the **Cerebras API** to generate a summary based on the scene descriptions.

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

* **Node.js and npm:** (v18 or later recommended) - [Download Node.js](https://nodejs.org/)
* **Python:** (v3.9 or later recommended) - [Download Python](https://www.python.org/downloads/)
* **FFmpeg:** A command-line tool for handling video and audio.
    * **macOS (using Homebrew):** `brew install ffmpeg`
    * **Ubuntu/Debian:** `sudo apt update && sudo apt install ffmpeg`
    * **Windows:** Download from the [official FFmpeg website](https://ffmpeg.org/download.html) and add the `bin` directory to your system's PATH.
* **Docker and Docker Compose:** Required for running the application in a containerized environment.

---

## Setup Instructions

Follow these steps to set up the project for local development.

### 1. Configure Environment Variables

The application requires API keys for the Google Gemini and Cerebras services.

* Copy the `.env.example` file to a new file named `.env` in the project's root directory.
* Open the new `.env` file and add your API keys.

```plaintext
# .env file

GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
CEREBRAS_API_KEY="YOUR_CEREBRAS_API_KEY"
````

To simplify running the application, you can use Docker Compose to start all services at once.

Build and start the services:
docker compose up -d --build

Once all services are running, you can access the FrameForge application in your browser, typically at http://localhost:5173.

