# Use Python 3.10 as base (tensorflow-cpu==2.10.0 has no wheels for 3.11+)
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies for OpenCV and other ML libs
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for memory optimization
ENV TF_CPP_MIN_LOG_LEVEL=3
ENV TF_FORCE_GPU_ALLOW_GROWTH=true
ENV MALLOC_TRIM_THRESHOLD_=100000
ENV PYTHONUNBUFFERED=1

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Start command (Render injects $PORT at runtime; default to 8000 for local docker run)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
