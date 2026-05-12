import tensorflow as tf
from tensorflow.keras.preprocessing import image
import numpy as np
import os

class MLService:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.class_names = ['Glioma Tumor', 'Meningioma Tumor', 'No Tumor', 'Pituitary Tumor']
        self.load_model()

    def load_model(self):
        """Loads the Keras model from the specified path."""
        if os.path.exists(self.model_path):
            try:
                self.model = tf.keras.models.load_model(self.model_path)
                print(f"Model loaded successfully from {self.model_path}")
            except Exception as e:
                print(f"Error loading model: {e}")
        else:
            print(f"Warning: Model file not found at {self.model_path}. Inference will fail.")

    def preprocess_image(self, img_path: str):
        """Preprocesses the image for the model (224x224, RGB)."""
        img = image.load_img(img_path, target_size=(224, 224))
        x = image.img_to_array(img)
        x = np.expand_dims(x, axis=0)
        # Add normalization if required by the model
        # x = x / 255.0 
        return x

    def predict(self, img_path: str):
        """Runs inference on the image and returns prediction and probabilities."""
        if self.model is None:
            return {"error": "Model not loaded"}

        processed_img = self.preprocess_image(img_path)
        predictions = self.model.predict(processed_img)
        
        # Get softmax probabilities
        probs = predictions[0].tolist()
        pred_idx = np.argmax(predictions[0])
        
        result = {
            "prediction": self.class_names[pred_idx],
            "confidence": float(predictions[0][pred_idx] * 100),
            "probabilities": {self.class_names[i]: float(probs[i] * 100) for i in range(len(self.class_names))}
        }
        return result

# Singleton instance
# Note: In production, you might want to load this from an environment variable
ml_service = MLService(os.path.join(os.path.dirname(__file__), "model", "VGGSKin.h5"))
