from flask import Flask, request, jsonify
from pydub import AudioSegment
import speech_recognition as sr
import os

app = Flask(__name__)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    video_path = request.json['video_path']
    audio = AudioSegment.from_file(video_path)
    audio.export("temp.wav", format="wav")
    
    r = sr.Recognizer()
    with sr.AudioFile("temp.wav") as source:
        audio_data = r.record(source)
        
    try:
        text = r.recognize_google(audio_data)
        print(f"Transcript: {text}", flush=True)
        return jsonify({'transcript': text})
    except sr.UnknownValueError:
        print('Error Occured - could not understand audio', flush=True)
        return jsonify({'error': 'Could not understand audio'})
    except sr.RequestError as e:
        print('Error Occured - Could not request results from Google Speech Recognition service', flush=True)
        return jsonify({'error': f'Could not request results from Google Speech Recognition service; {e}'})
    finally:
        os.remove("temp.wav")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004)