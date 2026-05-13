import tensorflow as tf
from tensorflow.keras.preprocessing import image
import numpy as np
import os
import cv2
import base64
from io import BytesIO
from PIL import Image as PILImage

class MLService:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.target_size = (128, 128)
        self.class_names = ['Glioma Tumor', 'Meningioma Tumor', 'No Tumor', 'Pituitary Tumor']
        self.last_conv_layer_name = "conv2d" # Found via inspection
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

    def make_gradcam_heatmap(self, img_array, model, last_conv_layer_name, pred_index=None):
        """Generates a Grad-CAM heatmap for a given image and layer."""
        grad_model = tf.keras.models.Model(
            [model.inputs], [model.get_layer(last_conv_layer_name).output, model.output]
        )

        with tf.GradientTape() as tape:
            last_conv_layer_output, preds = grad_model(img_array)
            if pred_index is None:
                pred_index = tf.argmax(preds[0])
            class_channel = preds[:, pred_index]

        grads = tape.gradient(class_channel, last_conv_layer_output)
        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

        last_conv_layer_output = last_conv_layer_output[0]
        heatmap = last_conv_layer_output @ pooled_grads[..., tf.newaxis]
        heatmap = tf.squeeze(heatmap)

        heatmap = tf.maximum(heatmap, 0) / tf.math.reduce_max(heatmap)
        return heatmap.numpy()

    def get_heatmap_overlay(self, img_path, heatmap, alpha=0.4):
        """Superimposes the heatmap on the original image."""
        img = cv2.imread(img_path)
        img = cv2.resize(img, self.target_size)
        
        heatmap = np.uint8(255 * heatmap)
        jet = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        
        jet_heatmap = cv2.resize(jet, (img.shape[1], img.shape[0]))
        superimposed_img = jet_heatmap * alpha + img
        superimposed_img = np.clip(superimposed_img, 0, 255).astype(np.uint8)
        
        _, buffer = cv2.imencode('.png', superimposed_img)
        return base64.b64encode(buffer).decode('utf-8')

    def generate_detailed_report(self, prediction, confidence, probabilities):
        """Generates a detailed text report based on prediction results."""
        if prediction == "No Tumor":
            report = f"Analysis complete. No significant pathological anomalies were detected in the provided MRI scan with a confidence level of {confidence:.2f}%. " \
                     f"The neural features align with healthy brain tissue characteristics."
        else:
            report = f"Pathology detected: {prediction}. The system identified features consistent with {prediction.lower()} in the scanned region. " \
                     f"Confidence score: {confidence:.2f}%. The heatmap highlights the localized areas of concern. " \
                     f"Recommended Next Steps: Immediate radiological review and clinical correlation."
        
        return {
            "summary": report,
            "status": "Healthy" if prediction == "No Tumor" else "Action Required",
            "risk_level": "Low" if prediction == "No Tumor" else "High"
        }

    def preprocess_image(self, img_path: str):
        """Preprocesses the image for the model (128x128, RGB)."""
        img = image.load_img(img_path, target_size=self.target_size)
        x = image.img_to_array(img)
        x = np.expand_dims(x, axis=0)
        return x

    def predict(self, img_path: str):
        """Runs inference on the image and returns prediction, heatmap, and report."""
        if self.model is None:
            return {"error": "Model not loaded"}

        processed_img = self.preprocess_image(img_path)
        predictions = self.model.predict(processed_img)
        
        probs = predictions[0].tolist()
        pred_idx = np.argmax(predictions[0])
        prediction = self.class_names[pred_idx]
        confidence = float(predictions[0][pred_idx] * 100)
        
        # Generate Heatmap
        try:
            heatmap = self.make_gradcam_heatmap(processed_img, self.model, self.last_conv_layer_name, pred_idx)
            heatmap_base64 = self.get_heatmap_overlay(img_path, heatmap)
        except Exception as e:
            print(f"Heatmap generation failed: {e}")
            heatmap_base64 = None

        # Generate Report
        report = self.generate_detailed_report(prediction, confidence, {self.class_names[i]: float(probs[i] * 100) for i in range(len(self.class_names))})
        
        result = {
            "prediction": prediction,
            "confidence": confidence,
            "probabilities": {self.class_names[i]: float(probs[i] * 100) for i in range(len(self.class_names))},
            "heatmap": heatmap_base64,
            "report": report
        }
        return result

# Singleton instance
ml_service = MLService(os.path.join(os.path.dirname(__file__), "model", "VGGSKin.h5"))
