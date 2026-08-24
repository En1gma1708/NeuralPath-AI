"""Phase 2c follow-up: does Phase 2's MC-Dropout uncertainty signal actually
catch the model's confidently-wrong predictions on external data?

Motivated by a real finding in eval_external_validation.py's confidence
breakdown: on the external set, the model's mean confidence when WRONGLY
predicting no-tumor for meningioma (0.919) is HIGHER than its confidence
when correctly predicting meningioma (0.845) - i.e. plain softmax confidence
actively misleads here. This checks whether MC-Dropout's predictive entropy
(which showed a real 7.17x separation on the IN-distribution held-out test
set, per docs/METRICS.md) still separates correct/incorrect on OUT-of-
distribution data, or whether that signal also breaks down under distribution
shift - either answer is a real, reportable finding, not a target to hit.

Usage: python eval_external_mc_dropout.py
"""
from pathlib import Path

import numpy as np
import tensorflow as tf

from data_pipeline import CLASS_NAMES
from mc_dropout_eval import mc_dropout_predict, N_PASSES, WEIGHTS_PATH
from model_def import build_model
from paths import EXTERNAL_VAL_RAW_DIR

IMG_SIZE = (224, 224)
BATCH = 16


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
    print(f"Loading weights from: {WEIGHTS_PATH}")
    model, base = build_model()
    model.load_weights(str(WEIGHTS_PATH))

    entries = build_manifest()
    print(f"{len(entries)} external validation images "
          f"across {len(set(c for _, c in entries))} classes.\n")
    print(f"Running MC-Dropout ({N_PASSES} passes/image) - this is "
          f"{N_PASSES}x slower than a single pass, expect several minutes...\n")

    y_true_names, y_pred_names, entropies, mean_confidences = [], [], [], []
    class_to_idx = {c: i for i, c in enumerate(CLASS_NAMES)}

    batch_imgs, batch_labels = [], []

    def flush_batch():
        if not batch_imgs:
            return
        x = tf.stack(batch_imgs)
        mean_probs, entropy = mc_dropout_predict(model, x)
        preds = np.argmax(mean_probs, axis=1)
        y_pred_names.extend(CLASS_NAMES[i] for i in preds)
        y_true_names.extend(batch_labels)
        entropies.extend(entropy)
        mean_confidences.extend(mean_probs[np.arange(len(preds)), preds])
        batch_imgs.clear()
        batch_labels.clear()

    for i, (filepath, cls) in enumerate(entries, 1):
        img = load_and_preprocess(filepath)
        batch_imgs.append(img)
        batch_labels.append(cls)
        if len(batch_imgs) >= BATCH:
            flush_batch()
        if i % 100 == 0:
            print(f"  {i}/{len(entries)}...")
    flush_batch()

    y_true_names = np.array(y_true_names)
    y_pred_names = np.array(y_pred_names)
    entropies = np.array(entropies)
    mean_confidences = np.array(mean_confidences)
    correct = y_true_names == y_pred_names

    acc = correct.mean()
    print(f"\nMC-Dropout mean-prediction accuracy on external set: {acc:.4f}")

    print(f"\nMean predictive entropy, correct predictions:   {entropies[correct].mean():.4f} (n={correct.sum()})")
    print(f"Mean predictive entropy, incorrect predictions: {entropies[~correct].mean():.4f} (n={(~correct).sum()})")
    ratio = entropies[~correct].mean() / max(entropies[correct].mean(), 1e-9)
    print(f"Ratio (incorrect/correct): {ratio:.2f}x")
    print(f"(In-distribution held-out test set, docs/METRICS.md: 7.17x)")

    print(f"\nMean MC-Dropout confidence, correct:   {mean_confidences[correct].mean():.4f}")
    print(f"Mean MC-Dropout confidence, incorrect: {mean_confidences[~correct].mean():.4f}")

    print("\nPer-class mean predictive entropy (external set):")
    for cls in CLASS_NAMES:
        mask = y_true_names == cls
        if mask.sum() == 0:
            continue
        print(f"  {cls:12s} entropy={entropies[mask].mean():.4f}  "
              f"accuracy={correct[mask].mean():.4f}  n={mask.sum()}")

    print("\nThe specific case that motivated this check - meningioma "
          "predicted as no-tumor:")
    men_as_notumor = (y_true_names == "meningioma") & (y_pred_names == "notumor")
    men_correct = (y_true_names == "meningioma") & correct
    if men_as_notumor.sum() > 0:
        print(f"  Mean entropy, meningioma->notumor errors: "
              f"{entropies[men_as_notumor].mean():.4f} (n={men_as_notumor.sum()})")
    if men_correct.sum() > 0:
        print(f"  Mean entropy, meningioma correct:          "
              f"{entropies[men_correct].mean():.4f} (n={men_correct.sum()})")

    print("\nVerdict:")
    if ratio > 1.3:
        print(f"  MC-Dropout entropy STILL separates correct/incorrect on "
              f"external data ({ratio:.2f}x) - the uncertainty signal "
              f"generalizes better than raw softmax confidence did.")
    else:
        print(f"  MC-Dropout entropy does NOT meaningfully separate "
              f"correct/incorrect on external data ({ratio:.2f}x, vs. 7.17x "
              f"in-distribution) - the uncertainty signal itself degrades "
              f"under distribution shift. Report this honestly: MC-Dropout "
              f"is not a reliable OOD/distribution-shift detector on this "
              f"evidence, even though it works well in-distribution.")


if __name__ == "__main__":
    main()
