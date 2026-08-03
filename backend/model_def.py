"""EfficientNetB0 architecture definition for the brain MRI classifier.

Self-contained copy of model/model_def.py's build_model(), kept independent
of the training-only model/ directory (which has kagglehub/imagehash/
scikit-learn deps not needed for serving) so the backend can be deployed
(Docker/EC2) without the training environment.

Must stay architecturally identical to model/model_def.py's build_model() -
this is what load_weights() reconstructs before loading
brain_mri_efficientnetb0.weights.h5 (see docs/DEVLOG.md 2026-07-31 entries
for how that checkpoint was produced and re-saved as inference-only).
"""
import tensorflow as tf
from tensorflow.keras import layers, models

IMG_SIZE = (224, 224)
NUM_CLASSES = 4


def build_model(num_classes=NUM_CLASSES, input_shape=(*IMG_SIZE, 3), dropout=0.3):
    base = tf.keras.applications.EfficientNetB0(
        include_top=False,
        weights=None,  # ImageNet weights aren't needed - real weights are loaded next
        input_shape=input_shape,
        pooling="avg",
    )
    base.trainable = False

    inputs = layers.Input(shape=input_shape)
    x = base(inputs, training=False)
    x = layers.Dropout(dropout)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs, name="efficientnetb0_brain_mri")
    return model, base
