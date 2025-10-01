FROM python:3.9-slim

WORKDIR /app

# Fix APT repository issues and install system dependencies
RUN rm -rf /var/lib/apt/lists/* && \
    apt-get clean && \
    apt-get update --fix-missing && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    libjpeg-dev \
    libpng-dev \
    zlib1g-dev \
    libtiff-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libwebp-dev \
    libopenjp2-7-dev \
    gcc \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip to latest version
RUN pip install --upgrade pip

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads


CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]

