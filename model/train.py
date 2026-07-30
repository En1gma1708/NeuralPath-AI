"""Phase 1 step 5: first training run (frozen EfficientNetB0 base + head only).

Trains the classification head on top of the frozen ImageNet base, then
evaluates once on the held-out val split. Saves the trained model and the
per-epoch history to CHECKPOINTS_DIR (see paths.py) so results are
reproducible and inspectable, per this project's audit-rigor convention.

Fine-tuning (unfreezing top base layers, lower LR) is a separate follow-up
step (Phase 1 checklist step 6), not part of this script.
"""
import json
import time

import tensorflow as tf

from data_pipeline import make_dataset
from model_def import build_model, compile_model
from paths import CHECKPOINTS_DIR

EPOCHS = 15
CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)


def main():
    print("Loading datasets...")
    train_ds, n_train = make_dataset("train", shuffle=True, augment=True)
    val_ds, n_val = make_dataset("val", shuffle=False, augment=False)
    print(f"  train: {n_train} images, val: {n_val} images")

    print("\nBuilding model (frozen EfficientNetB0 base)...")
    model, base = build_model()
    model = compile_model(model)

    # Weights-only checkpoint during training: TF 2.10's H5 full-model save can
    # fail to JSON-serialize certain optimizer state tensors mid-training
    # (hit this on epoch 1 - a known Keras/H5 quirk, not a data/model bug).
    # The full model is saved once at the end instead, after training is done.
    ckpt_path = CHECKPOINTS_DIR / "frozen_base_best.weights.h5"
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            str(ckpt_path), monitor="val_accuracy", save_best_only=True,
            save_weights_only=True, verbose=1,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=4, restore_best_weights=True, verbose=1
        ),
    ]

    print(f"\nTraining for up to {EPOCHS} epochs (frozen base, head only)...")
    start = time.time()
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        callbacks=callbacks,
    )
    elapsed = time.time() - start
    print(f"\nTraining finished in {elapsed / 60:.1f} min")

    # Write history first, before attempting any model save - if the save
    # step fails, the training results (the expensive part) aren't lost.
    history_path = CHECKPOINTS_DIR / "frozen_base_history.json"
    with open(history_path, "w") as f:
        json.dump(history.history, f, indent=2)
    print(f"Saved training history to: {history_path}")
    print(f"Best checkpoint (by val_accuracy, weights-only) saved to: {ckpt_path}")

    # No full-model .h5 save: TF 2.10's H5 full-model saver fails to
    # JSON-serialize certain optimizer state tensors (hit this in practice -
    # a known Keras/H5 quirk, not a data/model bug). Weights + architecture
    # reconstruction (model_def.build_model()) is sufficient and is what
    # check_fit.py and the backend integration step both already do.

    best_val_acc = max(history.history["val_accuracy"])
    best_epoch = history.history["val_accuracy"].index(best_val_acc) + 1
    print(f"\nBest val_accuracy: {best_val_acc:.4f} (epoch {best_epoch})")


if __name__ == "__main__":
    main()
