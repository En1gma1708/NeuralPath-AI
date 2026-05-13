# NeuralPath AI - Brain Pathology Detection

NeuralPath AI is a modern, production-ready full-stack web application designed for brain MRI pathology detection using deep learning.

## Features
- **Pathology Classification**: Deep learning based classification for Glioma, Meningioma, and Pituitary tumors.
- **Accuracy Metrics**: Detailed confidence scoring and softmax probability distributions.
- **Batch Processing**: Upload up to 20 MRI scans at once with real-time processing status.
- **Result History**: Local storage based scan history for easy retrieval and comparison.
- **Medlens AI Insights**: Integration with Groq's Llama-3.1 to generate clinical insights from the model's prediction.
- **Dynamic Neural Visualization**: Interactive, dynamic 3D neural network representation using Three.js.
- **Research Focused UI**: Clean interface built with Next.js 15, Shadcn UI, and Framer Motion for demonstrating model performance.

## Tech Stack
- **Frontend**: Next.js 15, Tailwind CSS, shadcn/ui, Framer Motion, Three.js (@react-three/fiber)
- **Backend**: FastAPI, TensorFlow/Keras, Langchain (Groq Llama-3.1)
- **Deployment**: Vercel (Frontend), Render (Backend).

## Project Structure
- `/frontend`: Next.js 15 web application.
- `/backend`: FastAPI inference server & LLM integration.
- `/model`: ML model weights and pipeline logic.

---
Developed as a Deep Learning Research Project for Brain Pathology Detection.
