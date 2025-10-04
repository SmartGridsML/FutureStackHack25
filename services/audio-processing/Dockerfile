FROM python:3.9-slim

RUN apt-get update && apt-get install -y ffmpeg \
    make \
    gcc \
    g++

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "app.py"]