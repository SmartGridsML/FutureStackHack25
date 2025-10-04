from flask import Flask, request, jsonify
from pydub import AudioSegment
import whisper_timestamped as whisper
import os
import tempfile

app = Flask(__name__)

# Load model ONCE at startup - upgrade for better editing precision
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")  # Upgrade from tiny
model = whisper.load_model(MODEL_SIZE, device="cpu")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "model": MODEL_SIZE})

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    data = request.json or {}
    video_path = data.get('video_path')
    if not video_path:
        return jsonify({'error': 'video_path required'}), 400
    
    if not os.path.exists(video_path):
        return jsonify({'error': 'file_not_found', 'path': video_path}), 404

    try:
        # Extract audio with high quality for analysis
        audio = AudioSegment.from_file(video_path)
        
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_path = temp_file.name
            # Export at 16kHz for Whisper, mono channel
            audio.export(temp_path, format="wav", parameters=["-ar", "16000", "-ac", "1"])

        # Enhanced transcription with word-level timing and disfluency detection
        audio_data = whisper.load_audio(temp_path)
        result = whisper.transcribe(
            model, 
            audio_data, 
            language="en",
            detect_disfluencies=True,  # Detect um, uh, etc.
            word_timestamps=True,
            vad=True  # Voice activity detection for better silence detection
        )

        # Extract detailed editing data
        segments = []
        filler_words = []
        silence_gaps = []
        
        # Process each segment
        for segment in result.get('segments', []):
            segment_data = {
                'start': segment['start'],
                'end': segment['end'], 
                'text': segment['text'].strip(),
                'confidence': segment.get('confidence', 0.8),
                'words': []
            }
            
            # Process word-level data for precise editing
            words = segment.get('words', [])
            for i, word in enumerate(words):
                word_text = word['text'].strip()
                word_data = {
                    'word': word_text,
                    'start': word['start'],
                    'end': word['end'],
                    'confidence': word.get('confidence', 0.8)
                }
                segment_data['words'].append(word_data)
                
                # Detect filler words with high confidence
                word_lower = word_text.lower()
                if word_lower in ['um', 'uh', 'er', 'ah', 'like', 'you', 'know', 'so', 'well', 'actually']:
                    if word.get('confidence', 0) > 0.6:  # Only high-confidence filler detection
                        filler_words.append({
                            'word': word_text,
                            'start': word['start'],
                            'end': word['end'],
                            'confidence': word.get('confidence', 0.8),
                            'type': 'filler'
                        })
                
                # Detect significant gaps between words
                if i < len(words) - 1:
                    next_word = words[i + 1]
                    gap = next_word['start'] - word['end']
                    if gap > 1.0:  # 1+ second gaps
                        silence_gaps.append({
                            'start': word['end'],
                            'end': next_word['start'],
                            'duration': gap,
                            'type': 'word_gap',
                            'context': f"After '{word_text}' before '{next_word['text']}'"
                        })
            
            segments.append(segment_data)

        # Detect longer inter-segment pauses
        for i in range(len(segments) - 1):
            current_end = segments[i]['end']
            next_start = segments[i + 1]['start']
            gap = next_start - current_end
            
            if gap > 2.0:  # 2+ second inter-segment gaps
                silence_gaps.append({
                    'start': current_end,
                    'end': next_start,
                    'duration': gap,
                    'type': 'long_pause',
                    'context': f"Between segments {i} and {i+1}"
                })

        # Calculate potential time savings
        total_filler_time = sum(f['end'] - f['start'] for f in filler_words)
        total_silence_time = sum(g['duration'] for g in silence_gaps)
        
        # Analyze speech rate for speed adjustment suggestions
        total_speech_time = sum(seg['end'] - seg['start'] for seg in segments)
        total_words = sum(len(seg['words']) for seg in segments)
        words_per_minute = (total_words / total_speech_time * 60) if total_speech_time > 0 else 0
        
        # Generate intelligent editing suggestions
        editing_suggestions = []
        
        if len(filler_words) > 5:
            editing_suggestions.append({
                'action': 'remove_filler_words',
                'description': f'Remove {len(filler_words)} filler words to save {total_filler_time:.1f} seconds',
                'impact': 'high' if total_filler_time > 10 else 'medium',
                'time_saved': total_filler_time
            })
        
        if len(silence_gaps) > 3:
            long_silences = [g for g in silence_gaps if g['duration'] > 3]
            if long_silences:
                silence_time = sum(g['duration'] for g in long_silences)
                editing_suggestions.append({
                    'action': 'trim_long_silences',
                    'description': f'Trim {len(long_silences)} long pauses to save {silence_time:.1f} seconds',
                    'impact': 'high' if silence_time > 15 else 'medium',
                    'time_saved': silence_time
                })
        
        if words_per_minute < 120:  # Slow speech
            editing_suggestions.append({
                'action': 'speed_up_segments',
                'description': f'Speech rate is {words_per_minute:.0f} WPM (slow). Consider 1.2x speed.',
                'impact': 'medium',
                'suggested_speed': 1.2
            })
        elif words_per_minute > 200:  # Very fast speech
            editing_suggestions.append({
                'action': 'slow_down_segments', 
                'description': f'Speech rate is {words_per_minute:.0f} WPM (very fast). Consider 0.9x speed.',
                'impact': 'low',
                'suggested_speed': 0.9
            })

        return jsonify({
            'transcript': result,
            'segments': segments,
            'filler_words': filler_words,
            'silence_gaps': silence_gaps,
            'analysis': {
                'total_duration': segments[-1]['end'] if segments else 0,
                'speech_duration': total_speech_time,
                'words_per_minute': words_per_minute,
                'filler_percentage': (total_filler_time / segments[-1]['end'] * 100) if segments else 0,
                'silence_percentage': (total_silence_time / segments[-1]['end'] * 100) if segments else 0
            },
            'editing_suggestions': editing_suggestions,
            'potential_savings': {
                'filler_time': total_filler_time,
                'silence_time': total_silence_time,
                'total_time_saved': total_filler_time + total_silence_time,
                'new_duration': (segments[-1]['end'] if segments else 0) - total_filler_time - total_silence_time
            }
        })
        
    except Exception as e:
        return jsonify({'error': 'transcription_failed', 'detail': str(e)}), 500
    finally:
        try:
            os.unlink(temp_path)
        except:
            pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004)