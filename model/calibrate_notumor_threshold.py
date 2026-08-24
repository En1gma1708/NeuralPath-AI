"""Phase 2c follow-up: calibrate an asymmetric decision threshold for the
notumor class, using the external validation set.

Motivation (docs/METRICS.md, docs/DEVLOG.md 2026-08-21): the model defaults
to "no tumor" when uncertain on external data, and does so confidently -
raw argmax lets a mediocre notumor score win over a genuinely higher-signal
tumor score. This script checks, using real external data (not assumed
numbers), what notumor probability threshold would separate the model's
correct notumor calls from its wrong ones (real tumors misclassified as
notumor) - i.e. finds evidence for where to set the bar, rather than
picking an arbitrary number.

Usage: python calibrate_notumor_threshold.py
"""
import numpy as np
import tensorflow as tf

from data_pipeline import CLASS_NAMES
from model_def import build_model
from paths import EXTERNAL_VAL_RAW_DIR
from pathlib import Path

IMG_SIZE = (224, 224)
BACKEND_WEIGHTS = Path(__file__).resolve().parent.parent / "backend" / "model" / \
    "brain_mri_efficientnetb0.weights.h5"
NOTUMOR_IDX = CLASS_NAMES.index("notumor")


def build_manifest():
    entries = []
    for cls in CLASS_NAMES:
        cls_dir = EXTERNAL_VAL_RAW_DIR / cls
        if not cls_dir.exists():
            continue
        entries.extend((str(f), cls) for f in sorted(cls_dir.glob("*.png")))
    return entries


def load_and_preprocess(filepath):
    raw = tf.io.read_file(filepath)
    img = tf.io.decode_png(raw, channels=1)
    img = tf.image.resize(img, IMG_SIZE)
    img = tf.image.grayscale_to_rgb(img)
    img = tf.cast(img, tf.float32)
    img = tf.keras.applications.efficientnet.preprocess_input(img)
    return img


def main():
    entries = build_manifest()
    model, base = build_model()
    model.load_weights(str(BACKEND_WEIGHTS))

    y_true, all_probs = [], []
    batch_imgs, batch_labels = [], []

    def flush():
        if not batch_imgs:
            return
        x = tf.stack(batch_imgs)
        preds = model.predict(x, verbose=0)
        all_probs.extend(preds.tolist())
        y_true.extend(batch_labels)
        batch_imgs.clear()
        batch_labels.clear()

    for i, (fp, cls) in enumerate(entries, 1):
        batch_imgs.append(load_and_preprocess(fp))
        batch_labels.append(cls)
        if len(batch_imgs) >= 32:
            flush()
    flush()

    y_true = np.array(y_true)
    all_probs = np.array(all_probs)  # (n, 4)
    notumor_prob = all_probs[:, NOTUMOR_IDX]
    argmax_pred = np.array([CLASS_NAMES[i] for i in np.argmax(all_probs, axis=1)])

    # Two groups that matter for calibrating this specific threshold:
    is_true_notumor = y_true == "notumor"
    is_true_tumor = ~is_true_notumor
    wrongly_called_notumor = is_true_tumor & (argmax_pred == "notumor")
    correctly_called_notumor = is_true_notumor & (argmax_pred == "notumor")

    print(f"True no-tumor images correctly called notumor: {correctly_called_notumor.sum()}")
    print(f"  their notumor-probability distribution: "
          f"min={notumor_prob[correctly_called_notumor].min():.3f} "
          f"p10={np.percentile(notumor_prob[correctly_called_notumor], 10):.3f} "
          f"median={np.median(notumor_prob[correctly_called_notumor]):.3f}")

    print(f"\nTrue TUMOR images wrongly called notumor: {wrongly_called_notumor.sum()}")
    print(f"  their notumor-probability distribution: "
          f"min={notumor_prob[wrongly_called_notumor].min():.3f} "
          f"median={np.median(notumor_prob[wrongly_called_notumor]):.3f} "
          f"p90={np.percentile(notumor_prob[wrongly_called_notumor], 90):.3f} "
          f"max={notumor_prob[wrongly_called_notumor].max():.3f}")

    print("\nSimulating a threshold: notumor only wins if its probability "
          "clears THRESHOLD, else fall back to the highest-scoring TUMOR "
          "class (glioma/meningioma/pituitary) instead:")
    print(f"{'threshold':>10} {'tumor_caught':>13} {'tumor_missed':>13} "
          f"{'true_notumor_flipped':>21} {'notumor_still_correct':>22}")
    for thresh in [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]:
        would_flip_from_notumor = notumor_prob < thresh
        # Of the wrongly-called-notumor tumor cases, how many get corrected
        # (flipped away from notumor) at this threshold?
        caught = (wrongly_called_notumor & would_flip_from_notumor).sum()
        missed = (wrongly_called_notumor & ~would_flip_from_notumor).sum()
        # Of the correctly-called-notumor cases, how many get WRONGLY
        # flipped away from notumor (a new error introduced)?
        flipped_true_notumor = (correctly_called_notumor & would_flip_from_notumor).sum()
        still_correct = (correctly_called_notumor & ~would_flip_from_notumor).sum()
        print(f"{thresh:>10.2f} {caught:>13} {missed:>13} "
              f"{flipped_true_notumor:>21} {still_correct:>22}")

    print("\nNote: 'tumor_caught' doesn't mean the tumor gets correctly "
          "classified - it means the system stops confidently saying "
          "'no tumor' and would flag/reroute to the next-best guess "
          "instead. That's the actual goal here (don't miss it silently), "
          "not necessarily getting the exact tumor type right on the "
          "first guess.")


if __name__ == "__main__":
    main()
