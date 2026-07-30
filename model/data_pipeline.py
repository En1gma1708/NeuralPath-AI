"""tf.data pipeline for the brain tumor MRI classifier.

Reads the leakage-safe split manifest built by build_split.py (NOT the raw
Training/Testing folders directly - see docs/DEVLOG.md 2026-07-12 entries for
why). Resizes to 224x224 for EfficientNetB0, converts every image to grayscale
then replicates to 3 channels (see docs/DEVLOG.md "Resolved RGB/grayscale
question" entry for why: 95.5% of RGB-mode files in this dataset were confirmed
to be channel-duplicated grayscale anyway, so this makes preprocessing uniform
and explicit regardless of each file's original stored mode).
"""
import csv

import tensorflow as tf

from paths import SPLIT_MANIFEST

MANIFEST = str(SPLIT_MANIFEST)
IMG_SIZE = (224, 224)
BATCH_SIZE = 16

# Order matches backend/ml_service.py's class_names order for later serving
# compatibility (Glioma, Meningioma, No Tumor, Pituitary).
CLASS_NAMES = ["glioma", "meningioma", "notumor", "pituitary"]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASS_NAMES)}


def load_manifest(split_name):
    with open(MANIFEST, newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["split"] == split_name]
    filepaths = [r["filepath"] for r in rows]
    labels = [CLASS_TO_IDX[r["class"]] for r in rows]
    return filepaths, labels


def _load_and_preprocess(filepath, label, augment=False):
    raw = tf.io.read_file(filepath)
    img = tf.io.decode_jpeg(raw, channels=1)  # force single-channel decode
    img = tf.image.resize(img, IMG_SIZE)
    img = tf.image.grayscale_to_rgb(img)  # replicate to 3ch for EfficientNetB0
    img = tf.cast(img, tf.float32)

    if augment:
        img = tf.image.random_flip_left_right(img)
        img = tf.image.random_brightness(img, max_delta=0.1)
        img = tf.image.random_contrast(img, lower=0.9, upper=1.1)
        # Small rotation via random rotation is not in core tf.image; skipped
        # here in favor of a Keras preprocessing layer if needed later.

    img = tf.keras.applications.efficientnet.preprocess_input(img)
    return img, label


def make_dataset(split_name, shuffle=False, augment=False):
    filepaths, labels = load_manifest(split_name)
    ds = tf.data.Dataset.from_tensor_slices((filepaths, labels))
    if shuffle:
        ds = ds.shuffle(buffer_size=len(filepaths), seed=42, reshuffle_each_iteration=True)
    ds = ds.map(
        lambda fp, lbl: _load_and_preprocess(fp, lbl, augment=augment),
        num_parallel_calls=tf.data.AUTOTUNE,
    )
    ds = ds.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)
    return ds, len(filepaths)


if __name__ == "__main__":
    for split in ["train", "val", "test"]:
        ds, n = make_dataset(split)
        for imgs, lbls in ds.take(1):
            print(f"{split}: {n} images, batch shape {imgs.shape}, "
                  f"dtype {imgs.dtype}, label sample {lbls.numpy()[:5]}")
