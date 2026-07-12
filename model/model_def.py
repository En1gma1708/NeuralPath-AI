"""EfficientNetB0 transfer-learning model for brain tumor MRI classification.

Frozen ImageNet-pretrained base + new classification head, per standard
transfer-learning practice for small datasets (~7k images here). See
docs/NOVELTY_PLAN.md Phase 1 for the architecture rationale (fits 4GB VRAM,
legitimate accuracy/efficiency tradeoff to discuss in an interview).
"""
import tensorflow as tf
from tensorflow.keras import layers, models

IMG_SIZE = (224, 224)
NUM_CLASSES = 4


def build_model(num_classes=NUM_CLASSES, input_shape=(*IMG_SIZE, 3), dropout=0.3):
    base = tf.keras.applications.EfficientNetB0(
        include_top=False,
        weights="imagenet",
        input_shape=input_shape,
        pooling="avg",
    )
    base.trainable = False  # frozen base for the first training pass

    inputs = layers.Input(shape=input_shape)
    x = base(inputs, training=False)
    x = layers.Dropout(dropout)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs, name="efficientnetb0_brain_mri")
    return model, base


def compile_model(model, learning_rate=1e-3):
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


if __name__ == "__main__":
    model, base = build_model()
    model = compile_model(model)
    model.summary()
    print(f"\nBase model trainable: {base.trainable}")
    print(f"Total params: {model.count_params():,}")
    trainable_params = sum(
        tf.size(w).numpy() for w in model.trainable_weights
    )
    print(f"Trainable params (head only): {trainable_params:,}")
