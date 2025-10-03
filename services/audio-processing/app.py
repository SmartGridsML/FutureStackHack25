from flask import Flask, request, jsonify
from pydub import AudioSegment
import whisper_timestamped as whisper
import os

app = Flask(__name__)

# Load model ONCE at startup
model = whisper.load_model("tiny", device="cpu")

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    video_path = request.json['video_path']
    audio = AudioSegment.from_file(video_path)
    audio.export("temp.wav", format="wav")

    try:
        audio = whisper.load_audio("temp.wav")
        result = whisper.transcribe(model, audio, language="en")

        print(f"Transcript: {result}", flush=True)
        return jsonify({'transcript': result})
    except Exception as e:
        return jsonify({'error': str(e)})
    finally:
        os.remove("temp.wav")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004)
