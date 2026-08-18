import tensorflow as tf
import numpy as np
import os
import cv2
import base64

from model_def import build_model

class MLService:
    def __init__(self, weights_path: str):
        self.weights_path = weights_path
        self.model = None
        self.base = None
        self.target_size = (224, 224)  # EfficientNetB0 input size
        # Order matches model/data_pipeline.py's CLASS_NAMES exactly - the
        # model's output index i corresponds to internal_class_names[i].
        # display_names is a separate, presentation-only mapping.
        self.internal_class_names = ['glioma', 'meningioma', 'notumor', 'pituitary']
        self.display_names = {
            'glioma': 'Glioma Tumor',
            'meningioma': 'Meningioma Tumor',
            'notumor': 'No Tumor',
            'pituitary': 'Pituitary Tumor',
        }
        self.gradcam_layer_name = "top_conv"
        self.grad_model = None
        # MC-Dropout: N stochastic forward passes with dropout forced active
        # (model(x, training=True) - the frozen EfficientNetB0 base's
        # BatchNorm stays in inference mode regardless, since base.trainable
        # is False; see docs/DEVLOG.md Phase 2 entry). Validated on the
        # held-out test set (model/mc_dropout_eval.py) before wiring in here:
        # incorrect predictions showed 7.17x higher predictive entropy than
        # correct ones - a real, usable uncertainty signal, not decoration.
        self.mc_dropout_passes = 30
        self.load_model()

    def load_model(self):
        """Builds the EfficientNetB0 architecture, loads the trained weights,
        and builds a dedicated Grad-CAM model (see _build_gradcam_model)."""
        if os.path.exists(self.weights_path):
            try:
                self.model, self.base = build_model()
                self.model.load_weights(self.weights_path)
                self.grad_model = self._build_gradcam_model()
                print(f"Model weights loaded successfully from {self.weights_path}")
            except Exception as e:
                print(f"Error loading model weights: {e}")
                self.model = None
        else:
            print(f"Warning: Weights file not found at {self.weights_path}. Inference will fail.")

    def _build_gradcam_model(self):
        """Builds a single Model producing (conv features, predictions) from
        one input, in one functional call - required for gradients to flow.

        EfficientNetB0 is a nested Functional submodel with skip-connections
        (Add/Multiply layers in its MBConv blocks). Two separate approaches
        that seem reasonable both fail: (1) reusing the submodel's own
        `.output` tensor directly disconnects it from the outer model's real
        input (Grad-CAM's grad_model ends up rooted at the submodel's own
        internal Input layer instead); (2) manually replaying layers one by
        one breaks on the Add/Multiply layers, which need multiple inputs,
        not a single chained tensor. The fix: build a small sub-model up to
        top_conv (which shares the same underlying weight objects as self.base
        - not a copy), call it functionally on a fresh top-level Input, then
        continue through the base's remaining post-top_conv layers (top_bn,
        top_activation, avg_pool - none of these branch) and the outer head,
        all within one Model() graph. See docs/DEVLOG.md 2026-07-31 backend
        integration entry.
        """
        inp = tf.keras.Input(shape=(*self.target_size, 3))
        base_conv_extractor = tf.keras.models.Model(
            self.base.input, self.base.get_layer(self.gradcam_layer_name).output
        )
        conv_out = base_conv_extractor(inp)

        x = conv_out
        past_conv_layer = False
        for layer in self.base.layers:
            if layer.name == self.gradcam_layer_name:
                past_conv_layer = True
                continue
            if past_conv_layer:
                x = layer(x)
        for layer in self.model.layers:
            if layer.name == self.base.name or "input" in layer.name:
                continue
            x = layer(x)

        return tf.keras.models.Model(inp, [conv_out, x])

    def make_gradcam_heatmap(self, img_array, pred_index=None):
        """Generates a Grad-CAM heatmap via the pre-built Grad-CAM model."""
        with tf.GradientTape() as tape:
            last_conv_layer_output, preds = self.grad_model(img_array)
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

    def estimate_uncertainty(self, img_array):
        """Runs MC-Dropout (N stochastic passes, dropout forced active) and
        returns (mean_probs, predictive_entropy, uncertainty_label).

        predictive_entropy is computed on the MEAN distribution across
        passes (not averaged per-pass entropy) - the standard MC-Dropout
        "predictive entropy" measure, capturing genuine spread across
        passes rather than each pass's own normal uncertainty. Thresholds
        for the label are derived from model/mc_dropout_eval.py's held-out
        test set run: correct predictions averaged ~0.077 entropy, incorrect
        ones ~0.554 - the label buckets sit around that observed separation,
        not arbitrary round numbers.
        """
        all_probs = np.stack(
            [self.model(img_array, training=True).numpy() for _ in range(self.mc_dropout_passes)],
            axis=0,
        )
        mean_probs = all_probs.mean(axis=0)
        entropy = float(-np.sum(mean_probs * np.log(mean_probs + 1e-12), axis=1)[0])

        if entropy < 0.15:
            label = "low"
        elif entropy < 0.4:
            label = "medium"
        else:
            label = "high"

        return mean_probs[0], entropy, label

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

    def generate_detailed_report(self, prediction, confidence):
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
        """Preprocesses the image to match training: resize to 224x224,
        force-decode to grayscale then replicate to 3 channels (the dataset's
        mixed RGB/grayscale files were normalized this way during training -
        see model/data_pipeline.py and docs/DEVLOG.md's "Resolved RGB/
        grayscale question" entry), then EfficientNet's preprocess_input."""
        raw = tf.io.read_file(img_path)
        img = tf.io.decode_image(raw, channels=1, expand_animations=False)
        img = tf.image.resize(img, self.target_size)
        img = tf.image.grayscale_to_rgb(img)
        img = tf.cast(img, tf.float32)
        img = tf.keras.applications.efficientnet.preprocess_input(img)
        return tf.expand_dims(img, axis=0)

    def predict(self, img_path: str):
        """Runs inference on the image and returns prediction, heatmap, and report."""
        if self.model is None:
            return {"error": "Model not loaded"}

        processed_img = self.preprocess_image(img_path)
        predictions = self.model.predict(processed_img, verbose=0)

        probs = predictions[0].tolist()
        pred_idx = int(np.argmax(predictions[0]))
        internal_name = self.internal_class_names[pred_idx]
        prediction = self.display_names[internal_name]
        confidence = float(predictions[0][pred_idx] * 100)

        # Generate Heatmap
        try:
            heatmap = self.make_gradcam_heatmap(processed_img, pred_idx)
            heatmap_base64 = self.get_heatmap_overlay(img_path, heatmap)
        except Exception as e:
            print(f"Heatmap generation failed: {e}")
            heatmap_base64 = None

        # MC-Dropout uncertainty (separate from the primary single-pass
        # prediction above - primary prediction/confidence/heatmap stay
        # deterministic and unchanged from before Phase 2, this is an
        # additional signal, not a replacement).
        try:
            _, entropy, uncertainty_label = self.estimate_uncertainty(processed_img)
            uncertainty = {"predictive_entropy": entropy, "level": uncertainty_label}
        except Exception as e:
            print(f"Uncertainty estimation failed: {e}")
            uncertainty = None

        probabilities = {
            self.display_names[self.internal_class_names[i]]: float(probs[i] * 100)
            for i in range(len(self.internal_class_names))
        }

        # Generate Report
        report = self.generate_detailed_report(prediction, confidence)

        result = {
            "prediction": prediction,
            "confidence": confidence,
            "probabilities": probabilities,
            "heatmap": heatmap_base64,
            "report": report,
            "uncertainty": uncertainty
        }
        return result

# Singleton instance
ml_service = MLService(os.path.join(os.path.dirname(__file__), "model", "brain_mri_efficientnetb0.weights.h5"))
