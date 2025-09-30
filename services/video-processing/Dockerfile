FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

COPY . .

# Make uploads directory available
RUN mkdir -p /app/uploads

CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
