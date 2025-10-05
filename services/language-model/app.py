from flask import Flask, request, jsonify
import os
from cerebras.cloud.sdk import Cerebras
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# --- Configure Cerebras SDK ---
try:
    client = Cerebras(api_key=os.environ.get("CEREBRAS_API_KEY"))
    print("Cerebras SDK configured successfully.")
except Exception as e:
    print(f"Error configuring Cerebras SDK: {e}")
    client = None

@app.route('/query', methods=['POST'])
def query_model():
    if not client:
        return jsonify({"error": "Cerebras SDK not configured. Check API Key."}), 500

    data = request.json
    context = data.get('context', 'No context provided.')
    
    prompt = f"""
    Based on the following scene descriptions from a video, write a concise, one-paragraph summary of the video.

    Scenes:
    {context}

    Summary:
    """
    
    try:
        print("--- Calling Cerebras Llama Model ---")
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-4-maverick-17b-128e-instruct", # Using a common, powerful model
        )
        response_text = chat_completion.choices[0].message.content
        print(f"--- Got response: {response_text} ---")
    except Exception as e:
        print(f"Error calling Cerebras API: {e}")
        response_text = "Failed to generate a summary from the language model."

    return jsonify({"response": response_text})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)

