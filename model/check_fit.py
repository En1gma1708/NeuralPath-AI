"""Diagnose overfitting/underfitting from a saved training run.

Two checks, run together since they answer the same question from different
angles:

1. Training-curve analysis (frozen_base_history.json): compares train vs val
   loss/accuracy trajectories. Flags overfitting (val loss rising while train
   loss keeps falling / growing train-val accuracy gap) and underfitting
   (both train and val accuracy stay low/flat).
2. True held-out test-set evaluation (the `test` split from split_manifest.csv,
   which the model has never seen in training or checkpoint selection) - a
   history plot alone can't tell you generalization, only a genuinely unseen
   split can. Reports accuracy, per-class precision/recall/F1, and a confusion
   matrix.

Usage: python check_fit.py [--history frozen_base_history.json]
                            [--weights frozen_base_best.weights.h5]
"""
import argparse
import json

import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

from data_pipeline import CLASS_NAMES, make_dataset
from model_def import build_model, compile_model
from paths import CHECKPOINTS_DIR

OVERFIT_GAP_THRESHOLD = 0.08  # train_acc - val_acc; above this, flag as overfitting
UNDERFIT_ACC_THRESHOLD = 0.60  # both train_acc and val_acc below this, flag as underfitting


def analyze_curves(history_path):
    print("=" * 60)
    print("TRAINING CURVE ANALYSIS")
    print("=" * 60)

    with open(history_path) as f:
        history = json.load(f)

    train_acc = history["accuracy"]
    val_acc = history["val_accuracy"]
    train_loss = history["loss"]
    val_loss = history["val_loss"]
    n_epochs = len(train_acc)

    print(f"\n{'Epoch':>6} {'train_loss':>11} {'val_loss':>10} "
          f"{'train_acc':>10} {'val_acc':>9} {'gap':>7}")
    for i in range(n_epochs):
        gap = train_acc[i] - val_acc[i]
        print(f"{i + 1:>6} {train_loss[i]:>11.4f} {val_loss[i]:>10.4f} "
              f"{train_acc[i]:>10.4f} {val_acc[i]:>9.4f} {gap:>7.4f}")

    final_gap = train_acc[-1] - val_acc[-1]
    best_val_epoch = int(np.argmax(val_acc))
    best_val_acc = val_acc[best_val_epoch]

    # val_loss trend over the last few epochs vs its minimum - a rising val
    # loss after its minimum, while train loss keeps dropping, is the
    # classic overfitting signature.
    min_val_loss_epoch = int(np.argmin(val_loss))
    val_loss_rising_after_min = (
        min_val_loss_epoch < n_epochs - 1
        and val_loss[-1] > val_loss[min_val_loss_epoch] + 0.02
    )

    print(f"\nFinal train_acc: {train_acc[-1]:.4f}  Final val_acc: {val_acc[-1]:.4f}"
          f"  Final gap: {final_gap:.4f}")
    print(f"Best val_acc: {best_val_acc:.4f} at epoch {best_val_epoch + 1}")
    print(f"Min val_loss: {val_loss[min_val_loss_epoch]:.4f} at epoch {min_val_loss_epoch + 1}")

    print("\nVerdict:")
    verdicts = []
    if final_gap > OVERFIT_GAP_THRESHOLD:
        verdicts.append(
            f"  OVERFITTING signal: train_acc exceeds val_acc by {final_gap:.4f} "
            f"(threshold {OVERFIT_GAP_THRESHOLD}) at the final epoch."
        )
    if val_loss_rising_after_min:
        verdicts.append(
            f"  OVERFITTING signal: val_loss rose from its minimum "
            f"({val_loss[min_val_loss_epoch]:.4f} @ epoch {min_val_loss_epoch + 1}) "
            f"to {val_loss[-1]:.4f} by the final epoch while train_loss kept falling."
        )
    if train_acc[-1] < UNDERFIT_ACC_THRESHOLD and val_acc[-1] < UNDERFIT_ACC_THRESHOLD:
        verdicts.append(
            f"  UNDERFITTING signal: both train_acc ({train_acc[-1]:.4f}) and "
            f"val_acc ({val_acc[-1]:.4f}) are below {UNDERFIT_ACC_THRESHOLD}."
        )
    if not verdicts:
        print("  No strong over/underfitting signal in the training curves - "
              "train and val accuracy/loss tracked each other reasonably closely.")
    else:
        for v in verdicts:
            print(v)

    return best_val_epoch, best_val_acc


def evaluate_on_test_set(weights_path):
    print("\n" + "=" * 60)
    print("HELD-OUT TEST SET EVALUATION (never seen during training)")
    print("=" * 60)

    model, _ = build_model()
    model = compile_model(model)
    model.load_weights(str(weights_path))

    test_ds, n_test = make_dataset("test", shuffle=False, augment=False)
    print(f"\nEvaluating on {n_test} held-out test images...")

    y_true = []
    y_pred = []
    for imgs, labels in test_ds:
        probs = model.predict(imgs, verbose=0)
        y_pred.extend(np.argmax(probs, axis=1))
        y_true.extend(labels.numpy())

    y_true = np.array(y_true)
    y_pred = np.array(y_pred)

    test_acc = (y_true == y_pred).mean()
    print(f"\nTest accuracy: {test_acc:.4f}")

    print("\nPer-class precision/recall/F1:")
    print(classification_report(y_true, y_pred, target_names=CLASS_NAMES, digits=4))

    print("Confusion matrix (rows=true, cols=predicted):")
    cm = confusion_matrix(y_true, y_pred)
    header = "".join(f"{c[:10]:>12}" for c in CLASS_NAMES)
    print(f"{'':12}{header}")
    for i, row in enumerate(cm):
        row_str = "".join(f"{v:>12}" for v in row)
        print(f"{CLASS_NAMES[i][:10]:12}{row_str}")

    return test_acc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--history", default=str(CHECKPOINTS_DIR / "frozen_base_history.json")
    )
    parser.add_argument(
        "--weights", default=str(CHECKPOINTS_DIR / "frozen_base_best.weights.h5")
    )
    args = parser.parse_args()

    best_val_epoch, best_val_acc = analyze_curves(args.history)
    test_acc = evaluate_on_test_set(args.weights)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Best val_accuracy during training: {best_val_acc:.4f} (epoch {best_val_epoch + 1})")
    print(f"  Held-out test_accuracy:            {test_acc:.4f}")
    val_test_gap = best_val_acc - test_acc
    print(f"  val - test gap:                    {val_test_gap:.4f}")
    if abs(val_test_gap) > 0.05:
        print("  NOTE: val and test accuracy diverge by >0.05 - worth a closer look "
              "(e.g. class balance or distribution differences between val/test splits).")


if __name__ == "__main__":
    main()
