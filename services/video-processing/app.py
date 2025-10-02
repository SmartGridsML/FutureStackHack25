# from flask import Flask, request, jsonify
# import subprocess
# import os
# import glob
# import shutil
# import requests
# from PIL import Image
# import google.generativeai as genai
# from dotenv import load_dotenv

# load_dotenv()

# app = Flask(__name__)

# # --- Configure Gemini API ---
# try:
#     genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
#     vision_model = genai.GenerativeModel('gemini-pro-vision')
#     print("Gemini AI configured successfully.")
# except Exception as e:
#     print(f"Error configuring Gemini AI: {e}")
#     vision_model = None

# # --- Constants ---
# MAX_FRAMES_TO_ANALYZE = 5

# def analyze_frame(image_path):
#     """Sends a single frame to Gemini for analysis."""
#     if not vision_model:
#         return "Gemini AI not configured. Check API Key."
        
#     try:
#         print(f"Analyzing frame: {image_path}")
#         img = Image.open(image_path)
#         response = vision_model.generate_content(["Describe this video frame in detail.", img])
#         return response.text
#     except Exception as e:
#         print(f"Error analyzing frame {image_path}: {e}")
#         return "Error analyzing frame."

# @app.route('/process', methods=['POST'])
# def process_video():
#     data = request.json
#     video_path = data['video_path']
#     video_filename = os.path.basename(video_path)
#     output_dir = f"temp_frames_{os.path.splitext(video_filename)[0]}"
    
#     if os.path.exists(output_dir):
#         shutil.rmtree(output_dir)
#     os.makedirs(output_dir)

#     print("--- Starting Video Processing ---")
    
#     # --- 1. Frame Extraction with FFmpeg ---
#     # Extract one frame every 5 seconds
#     cmd = ['ffmpeg', '-i', video_path, '-vf', 'fps=1/5', os.path.join(output_dir, 'frame-%04d.png')]
#     subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
#     # --- 2. Analyze Frames with Gemini ---
#     frames = sorted(glob.glob(os.path.join(output_dir, '*.png')))
#     frames_to_analyze = frames[:MAX_FRAMES_TO_ANALYZE]
    
#     scene_descriptions = []
#     scenes_context = ""
#     for i, frame_path in enumerate(frames_to_analyze):
#         description = analyze_frame(frame_path)
#         timestamp = (i + 1) * 5 # Since we extract one frame every 5 seconds
#         scene_descriptions.append({"timestamp": f"{timestamp}s", "description": description})
#         scenes_context += f"At {timestamp} seconds: {description}\n"

#     print(f"--- Scene Descriptions Generated ---\n{scenes_context}")
    
#     # --- 3. Call Language Model Service for Summary ---
#     summary = "Could not generate summary."
#     try:
#         print("--- Querying Language Model for Summary ---")
#         lang_model_response = requests.post(
#             # 'http://language-model:5001/query',
#             'http://localhost:5001/query',
#             json={'context': scenes_context}
#         )
#         if lang_model_response.status_code == 200:
#             summary = lang_model_response.json().get('response', summary)
#     except Exception as e:
#         print(f"Error calling language model service: {e}")

#     # --- 4. Clean up and Return Results ---
#     shutil.rmtree(output_dir)
#     print("--- Processing Complete ---")
    
#     return jsonify({
#         "scenes": scene_descriptions,
#         "summary": summary
#     })

# if __name__ == '__main__':
#     app.run(host='0.0.0.0', port=5000)


from flask import Flask, request, jsonify
import subprocess
import os
import glob
import shutil
import requests
import json
from PIL import Image
import google.generativeai as genai
from dotenv import load_dotenv
import re
import concurrent.futures

load_dotenv()

app = Flask(__name__)

# --- Configure Gemini API ---
try:
    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    vision_model = genai.GenerativeModel('gemini-2.5-flash-lite')
    print("Gemini AI configured successfully.")
except Exception as e:
    print(f"Error configuring Gemini AI: {e}")
    vision_model = None

# --- Constants ---
MAX_FRAMES_TO_ANALYZE = 10  # Increased from 5 to 10
LANG_MODEL_URL = os.environ.get("LANGUAGE_MODEL_URL", "http://language-model:5001")


def get_video_duration(video_path):
    """Get the duration of a video file in seconds using ffprobe"""
    cmd = [
        'ffprobe', 
        '-v', 'error', 
        '-show_entries', 'format=duration', 
        '-of', 'json', 
        video_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error getting video duration: {result.stderr}")
            return None
            
        output = json.loads(result.stdout)
        duration = float(output['format']['duration'])
        return duration
    except Exception as e:
        print(f"Failed to get video duration: {e}")
        return None


def sample_frames_throughout_video(video_path, output_dir, max_frames):
    """Extract frames distributed throughout the video duration"""
    # Get video duration
    duration = get_video_duration(video_path)
    if not duration:
        # Fallback to default extraction method if duration can't be determined
        print("Could not determine video duration, using default frame extraction")
        cmd = ['ffmpeg', '-i', video_path, '-vf', f'fps=1/5', os.path.join(output_dir, 'frame-%04d.png')]
        subprocess.run(cmd, capture_output=True)
        return
    
    print(f"Video duration: {duration:.2f} seconds")
    
    # Ensure we don't try to extract more frames than make sense
    if duration < max_frames * 5:
        # For short videos, extract 1 frame every 5 seconds
        cmd = ['ffmpeg', '-i', video_path, '-vf', f'fps=1/5', os.path.join(output_dir, 'frame-%04d.png')]
    else:
        # For longer videos, distribute the frames evenly throughout the video
        interval = duration / max_frames
        timestamps = [int(i * interval) for i in range(max_frames)]
        
        # Create a complex filter to select frames at specific timestamps
        frame_commands = []
        for i, ts in enumerate(timestamps):
            # Extract each frame separately at the calculated timestamps
            cmd = [
                'ffmpeg', '-ss', str(ts), '-i', video_path, 
                '-vframes', '1', 
                os.path.join(output_dir, f'frame-{i+1:04d}.png')
            ]
            print(f"Extracting frame at {ts}s")
            subprocess.run(cmd, capture_output=True)
            
        return timestamps


def analyze_frame(image_path):
    """Sends a single frame to Gemini for analysis."""
    if not vision_model:
        return "Gemini AI not configured. Check API Key."
        
    try:
        print(f"Analyzing frame: {image_path}")
        img = Image.open(image_path)
        
        # Resize to an optimal size for the API (1080p is usually sufficient)
        max_size = (1920, 1080)
        if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        response = vision_model.generate_content(["Describe this video frame in detail.", img])
        return response.text
    except Exception as e:
        print(f"Error analyzing frame {image_path}: {e}")
        return "Error analyzing frame."


@app.route('/process', methods=['POST'])
def process_video():
    data = request.json
    video_path = data['video_path']
    video_filename = os.path.basename(video_path)
    output_dir = f"temp_frames_{int(os.path.getmtime(video_path))}"
    
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    print("--- Starting Video Processing ---")
    
    # --- 1. Frame Extraction with intelligent sampling ---
    timestamps = sample_frames_throughout_video(video_path, output_dir, MAX_FRAMES_TO_ANALYZE)
    
    # --- 2. Analyze Frames with Gemini ---
    frames = sorted(glob.glob(os.path.join(output_dir, '*.png')))

    if not frames:
        print("--- No frames were extracted from the video. ---")
        shutil.rmtree(output_dir)
        return jsonify({"error": "No frames could be extracted from the video."}), 500
    
    # Take all frames we extracted (should be MAX_FRAMES_TO_ANALYZE or fewer)
    frames_to_analyze = frames
    
    scene_descriptions = []
    scenes_context = ""

    # Use ThreadPoolExecutor for concurrent API calls
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        # Map function to all frames - this runs in parallel
        future_to_frame = {
            executor.submit(analyze_frame, frame_path): (i, frame_path) 
            for i, frame_path in enumerate(frames_to_analyze)
        }
        
        # Collect results as they complete
        for future in concurrent.futures.as_completed(future_to_frame):
            i, frame_path = future_to_frame[future]
            description = future.result()
            
            # Use the actual timestamp if we have it, otherwise estimate
            if timestamps and i < len(timestamps):
                timestamp = timestamps[i]
            else:
                match = re.search(r'frame-(\d+)', os.path.basename(frame_path))
                if match:
                    frame_num = int(match.group(1))
                    timestamp = frame_num * 5
                else:
                    timestamp = (i + 1) * 5
                    
            scene_descriptions.append({"timestamp": timestamp, "description": description})
            scenes_context += f"At {timestamp} seconds: {description}\n"

    print(f"--- Scene Descriptions Generated ---\n{scenes_context}")
    
    # --- 3. Call Language Model Service for Summary ---
    summary = "Could not generate summary."
    try:
        print("--- Querying Language Model for Summary ---")
        lang_model_response = requests.post(
            f"{LANG_MODEL_URL}/query",
            json={'context': scenes_context}
        )
        if lang_model_response.status_code == 200:
            summary = lang_model_response.json().get('response', summary)
    except Exception as e:
        print(f"Error calling language model service: {e}")

    # --- 4. Clean up and Return Results ---
    shutil.rmtree(output_dir)
    print("--- Processing Complete ---")
    
    return jsonify({
        "scenes": scene_descriptions,
        "summary": summary
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)