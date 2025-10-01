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
from PIL import Image
import google.generativeai as genai
from dotenv import load_dotenv

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
MAX_FRAMES_TO_ANALYZE = 5

def analyze_frame(image_path):
    """Sends a single frame to Gemini for analysis."""
    if not vision_model:
        return "Gemini AI not configured. Check API Key."
        
    try:
        print(f"Analyzing frame: {image_path}")
        img = Image.open(image_path)
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
    output_dir = f"temp_frames_{os.path.splitext(video_filename)[0]}"
    
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    print("--- Starting Video Processing ---")
    
    # --- 1. Frame Extraction with FFmpeg (with error logging) ---
    cmd = ['ffmpeg', '-i', video_path, '-vf', 'fps=1/5', os.path.join(output_dir, 'frame-%04d.png')]
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("--- FFmpeg Error ---")
        print("Stdout:", result.stdout)
        print("Stderr:", result.stderr)
        shutil.rmtree(output_dir)
        return jsonify({"error": "Failed to extract frames from video.", "ffmpeg_error": result.stderr}), 500

    
    # --- 2. Analyze Frames with Gemini ---
    frames = sorted(glob.glob(os.path.join(output_dir, '*.png')))

    if not frames:
        print("--- No frames were extracted from the video. ---")
        shutil.rmtree(output_dir)
        return jsonify({"error": "No frames could be extracted from the video."}), 500
    
    frames_to_analyze = frames[:MAX_FRAMES_TO_ANALYZE]
    
    scene_descriptions = []
    scenes_context = ""
    for i, frame_path in enumerate(frames_to_analyze):
        description = analyze_frame(frame_path)
        timestamp = (i + 1) * 5 # Since we extract one frame every 5 seconds
        scene_descriptions.append({"timestamp": f"{timestamp}s", "description": description})
        scenes_context += f"At {timestamp} seconds: {description}\n"

    print(f"--- Scene Descriptions Generated ---\n{scenes_context}")
    
    # --- 3. Call Language Model Service for Summary ---
    summary = "Could not generate summary."
    try:
        print("--- Querying Language Model for Summary ---")
        lang_model_response = requests.post(
            'http://language-model:5002/query', # Corrected for local debugging
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