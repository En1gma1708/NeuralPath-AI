"""Phase 2c: evaluate the fine-tuned model against the composite
external-validation set built by download_external_validation.py +
download_meningioma_synapse.py.

Runs BOTH the raw model (argmax) and the asymmetric notumor decision rule
now live in backend/ml_service.py's predict() (2026-08-21), so results here
reflect what the deployed app actually returns, not just the underlying
model - this script deliberately runs in training_env (not backend/venv),
so the decision-rule logic is reimplemented here rather than imported;
keep the two in sync if notumor_confidence_threshold changes in
ml_service.py. Reports overall + per-class accuracy/precision/recall/F1 and
a confusion matrix, compared honestly against the in-distribution held-out
test set's 94.42% (docs/METRICS.md) - the point of this script is measuring
the real generalization gap, not confirming a preset expectation.

Uses backend/model/brain_mri_efficientnetb0.weights.h5 (the frozen-structure
serving checkpoint) rather than the raw fine-tuned checkpoint, to avoid the
TF 2.10 trainable-flag load quirk documented in CLAUDE.md - this checkpoint
was deliberately re-saved with the default frozen structure for exactly this
kind of simple load-and-infer use case.

Usage: python eval_external_validation.py
"""
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix

from data_pipeline import CLASS_NAMES
from model_def import build_model
from paths import EXTERNAL_VAL_RAW_DIR

IMG_SIZE = (224, 224)
BACKEND_WEIGHTS = Path(__file__).resolve().parent.parent / "backend" / "model" / \
    "brain_mri_efficientnetb0.weights.h5"

IN_DISTRIBUTION_TEST_ACCURACY = 0.9442  # docs/METRICS.md, fine-tuned model
NOTUMOR_IDX = CLASS_NAMES.index("notumor")
# Must match backend/ml_service.py's notumor_confidence_threshold exactly.
NOTUMOR_CONFIDENCE_THRESHOLD = 0.90


def apply_decision_rule(probs_batch):
    """Mirrors ml_service.py's predict() override: if notumor is the argmax
    but its probability is below threshold, fall back to the
    highest-scoring TUMOR class instead. Returns (pred_idx, overridden) per
    row."""
    pred_idx = np.argmax(probs_batch, axis=1)
    overridden = np.zeros(len(pred_idx), dtype=bool)
    for i in range(len(pred_idx)):
        if pred_idx[i] == NOTUMOR_IDX and probs_batch[i, NOTUMOR_IDX] < NOTUMOR_CONFIDENCE_THRESHOLD:
            tumor_indices = [j for j in range(probs_batch.shape[1]) if j != NOTUMOR_IDX]
            pred_idx[i] = max(tumor_indices, key=lambda j: probs_batch[i, j])
            overridden[i] = True
    return pred_idx, overridden


def build_manifest():
    """raw/<class>/*.png -> [(filepath, class_name), ...]. Folder names
    already match CLASS_NAMES exactly (glioma, meningioma, notumor,
    pituitary) - see download_external_validation.py / paths.py."""
    entries = []
    for cls in CLASS_NAMES:
        cls_dir = EXTERNAL_VAL_RAW_DIR / cls
        if not cls_dir.exists():
            print(f"WARNING: {cls_dir} does not exist, skipping class '{cls}'")
            continue
        files = sorted(cls_dir.glob("*.png"))
        print(f"  {cls}: {len(files)} images")
        entries.extend((str(f), cls) for f in files)
    return entries


def load_and_preprocess(filepath):
    """Matches data_pipeline.py's _load_and_preprocess exactly: force
    grayscale decode, resize, replicate to 3ch, EfficientNet preprocessing -
    same pipeline the model was trained on, applied identically here so any
    accuracy drop reflects real distribution shift, not a preprocessing
    mismatch."""
    raw = tf.io.read_file(filepath)
    img = tf.io.decode_png(raw, channels=1)
    img = tf.image.resize(img, IMG_SIZE)
    img = tf.image.grayscale_to_rgb(img)
    img = tf.cast(img, tf.float32)
    img = tf.keras.applications.efficientnet.preprocess_input(img)
    return img


def main():
    print("Building manifest from external validation set...")
    entries = build_manifest()
    if not entries:
        raise SystemExit("No external validation images found - run the "
                          "download scripts first.")
    print(f"Total: {len(entries)} images across {len(set(c for _, c in entries))} classes.\n")

    print(f"Loading model weights from {BACKEND_WEIGHTS}...")
    model, base = build_model()
    model.load_weights(str(BACKEND_WEIGHTS))
    print("Model loaded.\n")

    print("Running inference (fine-tuned model + the live notumor decision "
          f"rule, threshold={NOTUMOR_CONFIDENCE_THRESHOLD})...")
    y_true = []
    y_pred = []
    y_pred_raw = []  # argmax with no decision rule, for comparison
    y_confidence = []  # softmax prob of the predicted (post-rule) class
    y_overridden = []
    batch_imgs = []
    batch_labels = []
    BATCH = 32

    def flush_batch():
        if not batch_imgs:
            return
        x = tf.stack(batch_imgs)
        preds = model.predict(x, verbose=0)
        raw_pred_idx = np.argmax(preds, axis=1)
        pred_idx, overridden = apply_decision_rule(preds)
        y_pred.extend(CLASS_NAMES[i] for i in pred_idx)
        y_pred_raw.extend(CLASS_NAMES[i] for i in raw_pred_idx)
        y_confidence.extend(preds[np.arange(len(pred_idx)), pred_idx].tolist())
        y_overridden.extend(overridden.tolist())
        y_true.extend(batch_labels)
        batch_imgs.clear()
        batch_labels.clear()

    for i, (filepath, cls) in enumerate(entries, 1):
        try:
            img = load_and_preprocess(filepath)
        except Exception as e:
            print(f"  WARN: failed to load {filepath}: {e}")
            continue
        batch_imgs.append(img)
        batch_labels.append(cls)
        if len(batch_imgs) >= BATCH:
            flush_batch()
        if i % 200 == 0:
            print(f"  {i}/{len(entries)}...")
    flush_batch()

    print(f"\nEvaluated {len(y_true)} images.\n")

    print("=" * 60)
    print("EXTERNAL VALIDATION RESULTS")
    print("=" * 60)

    raw_acc = sum(t == p for t, p in zip(y_true, y_pred_raw)) / len(y_true)
    overall_acc = sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true)
    n_overridden = sum(y_overridden)
    print(f"\nRaw model accuracy (no decision rule):        {raw_acc:.4f} ({raw_acc*100:.2f}%)")
    print(f"With notumor decision rule (threshold={NOTUMOR_CONFIDENCE_THRESHOLD}): "
          f"{overall_acc:.4f} ({overall_acc*100:.2f}%)")
    print(f"Decision rule fired on {n_overridden}/{len(y_true)} images "
          f"({n_overridden/len(y_true)*100:.1f}%)")
    print(f"\nIn-distribution held-out test accuracy (docs/METRICS.md): "
          f"{IN_DISTRIBUTION_TEST_ACCURACY:.4f} ({IN_DISTRIBUTION_TEST_ACCURACY*100:.2f}%)")
    gap = IN_DISTRIBUTION_TEST_ACCURACY - overall_acc
    print(f"Generalization gap (with decision rule applied): {gap:+.4f} ({gap*100:+.2f} points)")

    print("\nPer-class report (WITH decision rule applied - this is what the "
          "deployed app actually returns):")
    print(classification_report(y_true, y_pred, labels=CLASS_NAMES, zero_division=0))

    print("Per-class report (raw model, no decision rule - for comparison):")
    print(classification_report(y_true, y_pred_raw, labels=CLASS_NAMES, zero_division=0))

    print("Confusion matrix (rows=true, cols=predicted):")
    cm = confusion_matrix(y_true, y_pred, labels=CLASS_NAMES)
    header = "true\\pred".ljust(12) + "".join(c[:10].ljust(11) for c in CLASS_NAMES)
    print(header)
    for cls, row in zip(CLASS_NAMES, cm):
        print(cls.ljust(12) + "".join(str(v).ljust(11) for v in row))

    print("\nMean prediction confidence (softmax prob of predicted class), "
          "by true class and correct/incorrect:")
    y_true_arr = np.array(y_true)
    y_pred_arr = np.array(y_pred)
    y_conf_arr = np.array(y_confidence)
    correct_mask = y_true_arr == y_pred_arr
    for cls in CLASS_NAMES:
        cls_mask = y_true_arr == cls
        if cls_mask.sum() == 0:
            continue
        correct_conf = y_conf_arr[cls_mask & correct_mask]
        incorrect_conf = y_conf_arr[cls_mask & ~correct_mask]
        correct_str = f"{correct_conf.mean():.3f} (n={len(correct_conf)})" if len(correct_conf) else "n/a"
        incorrect_str = f"{incorrect_conf.mean():.3f} (n={len(incorrect_conf)})" if len(incorrect_conf) else "n/a"
        print(f"  {cls:12} correct: {correct_str:20} incorrect: {incorrect_str}")


if __name__ == "__main__":
    main()
