"""Phase 2, steps 1-3: MC-Dropout uncertainty quantification, validated on
the held-out test set before wiring into the backend.

Runs N stochastic forward passes per image (dropout forced active via
model(x, training=True), which leaves the frozen EfficientNetB0 base's
BatchNorm in inference mode - see docs/DEVLOG.md for why this is safe here),
and reports whether the resulting uncertainty signal actually correlates
with correctness. If it doesn't, the technique isn't earning its place as a
differentiator and that needs to be reported honestly, not hidden.
"""
import numpy as np
import tensorflow as tf

from pathlib import Path

from data_pipeline import CLASS_NAMES, make_dataset
from model_def import build_model

N_PASSES = 30
# The inference-only re-saved checkpoint (frozen trainable-structure, no
# unfreeze_for_finetuning() needed to load it) - see docs/DEVLOG.md's backend
# integration entry for why this file exists separately from
# checkpoints/finetuned_best.weights.h5.
WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "backend" / "model" / "brain_mri_efficientnetb0.weights.h5"


def mc_dropout_predict(model, img_batch, n_passes=N_PASSES):
    """Returns (mean_probs, predictive_entropy) per image in the batch.

    predictive_entropy is computed on the MEAN distribution across passes
    (not averaged per-pass entropy) - this is "predictive entropy," the
    standard MC-Dropout uncertainty measure, and captures genuine
    epistemic uncertainty (spread across passes) rather than reducing to
    the model's normal per-pass aleatoric uncertainty.
    """
    all_probs = np.stack(
        [model(img_batch, training=True).numpy() for _ in range(n_passes)],
        axis=0,
    )  # (n_passes, batch, num_classes)
    mean_probs = all_probs.mean(axis=0)  # (batch, num_classes)
    entropy = -np.sum(mean_probs * np.log(mean_probs + 1e-12), axis=1)
    return mean_probs, entropy


def main():
    print(f"Loading fine-tuned weights from: {WEIGHTS_PATH}")
    model, base = build_model()
    model.load_weights(str(WEIGHTS_PATH))

    test_ds, n_test = make_dataset("test", shuffle=False, augment=False)
    print(f"Running MC-Dropout ({N_PASSES} passes/image) on {n_test} held-out test images...\n")

    y_true, y_pred, entropies, mean_confidences = [], [], [], []
    for imgs, labels in test_ds:
        mean_probs, entropy = mc_dropout_predict(model, imgs)
        preds = np.argmax(mean_probs, axis=1)
        y_true.extend(labels.numpy())
        y_pred.extend(preds)
        entropies.extend(entropy)
        mean_confidences.extend(mean_probs[np.arange(len(preds)), preds])

    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    entropies = np.array(entropies)
    mean_confidences = np.array(mean_confidences)
    correct = y_true == y_pred

    acc = correct.mean()
    print(f"MC-Dropout mean-prediction accuracy: {acc:.4f} "
          f"(compare to check_fit.py's single-pass 94.42% - should be close, "
          f"MC-Dropout averaging can shift it slightly either way)")

    print(f"\nMean predictive entropy, correct predictions:   {entropies[correct].mean():.4f}")
    print(f"Mean predictive entropy, incorrect predictions: {entropies[~correct].mean():.4f}")
    ratio = entropies[~correct].mean() / max(entropies[correct].mean(), 1e-9)
    print(f"Ratio (incorrect/correct): {ratio:.2f}x")

    print(f"\nMean confidence, correct predictions:   {mean_confidences[correct].mean():.4f}")
    print(f"Mean confidence, incorrect predictions: {mean_confidences[~correct].mean():.4f}")

    # Per-class entropy - check whether meningioma (the known hardest class)
    # also shows elevated uncertainty, which would be a coherent story.
    print("\nPer-class mean predictive entropy:")
    for i, cls in enumerate(CLASS_NAMES):
        mask = y_true == i
        print(f"  {cls:12s} entropy={entropies[mask].mean():.4f}  "
              f"accuracy={correct[mask].mean():.4f}  n={mask.sum()}")

    print("\nVerdict:")
    if ratio > 1.3:
        print(f"  Uncertainty signal is MEANINGFUL: incorrect predictions show "
              f"{ratio:.2f}x higher entropy than correct ones. Safe to wire into "
              f"the backend as a real confidence-interval / flagging signal.")
    elif ratio > 1.05:
        print(f"  Uncertainty signal is WEAK but present ({ratio:.2f}x). Still "
              f"directionally correct, worth shipping but don't oversell the "
              f"separation in the interview write-up.")
    else:
        print(f"  Uncertainty signal does NOT meaningfully separate correct from "
              f"incorrect predictions ({ratio:.2f}x). Do not ship this as a "
              f"trustworthy signal without investigating further - report this "
              f"finding honestly rather than wiring it in anyway.")


if __name__ == "__main__":
    main()
