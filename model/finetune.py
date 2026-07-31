"""Phase 1 step 6: fine-tuning pass.

Continues training from the best frozen-base checkpoint (train.py), unfreezing
the top of the EfficientNetB0 base (block6 onward - the last two MBConv block
groups plus the final top_conv, ~76 of 239 base layers) and training at a much
lower learning rate. Standard transfer-learning fine-tuning practice: adapt
higher-level features to the target domain (MRI) while leaving early generic
filters (edges/textures) frozen, since the training set here (~5k images) is
too small to safely retrain the whole backbone from scratch.

Goal: see whether this closes the meningioma precision/recall gap found in
the frozen-base pass (76.3% precision, 82.3% recall - see docs/METRICS.md).
"""
import json
import time

import tensorflow as tf

from data_pipeline import make_dataset
from model_def import build_model, unfreeze_for_finetuning
from paths import CHECKPOINTS_DIR

EPOCHS = 15
FINE_TUNE_LR = 1e-5  # ~100x lower than the frozen-base pass's 1e-3
UNFREEZE_FROM_LAYER = 163  # block6a onward, see DEVLOG for how this was chosen

FROZEN_WEIGHTS = CHECKPOINTS_DIR / "frozen_base_best.weights.h5"
CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)


def main():
    print("Loading datasets...")
    train_ds, n_train = make_dataset("train", shuffle=True, augment=True)
    val_ds, n_val = make_dataset("val", shuffle=False, augment=False)
    print(f"  train: {n_train} images, val: {n_val} images")

    print(f"\nLoading frozen-base best weights from: {FROZEN_WEIGHTS}")
    model, base = build_model()
    model.load_weights(str(FROZEN_WEIGHTS))

    print(f"Unfreezing base layers from index {UNFREEZE_FROM_LAYER} "
          f"({base.layers[UNFREEZE_FROM_LAYER].name}) onward "
          f"({len(base.layers) - UNFREEZE_FROM_LAYER}/{len(base.layers)} layers)...")
    unfreeze_for_finetuning(base, UNFREEZE_FROM_LAYER)

    trainable_params = sum(tf.size(w).numpy() for w in model.trainable_weights)
    print(f"Trainable params after unfreeze: {trainable_params:,}")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=FINE_TUNE_LR),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    ckpt_path = CHECKPOINTS_DIR / "finetuned_best.weights.h5"
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            str(ckpt_path), monitor="val_accuracy", save_best_only=True,
            save_weights_only=True, verbose=1,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=4, restore_best_weights=True, verbose=1
        ),
    ]

    print(f"\nFine-tuning for up to {EPOCHS} epochs (lr={FINE_TUNE_LR})...")
    start = time.time()
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        callbacks=callbacks,
    )
    elapsed = time.time() - start
    print(f"\nFine-tuning finished in {elapsed / 60:.1f} min")

    history_path = CHECKPOINTS_DIR / "finetuned_history.json"
    with open(history_path, "w") as f:
        json.dump(history.history, f, indent=2)
    print(f"Saved training history to: {history_path}")
    print(f"Best checkpoint (by val_accuracy, weights-only) saved to: {ckpt_path}")

    best_val_acc = max(history.history["val_accuracy"])
    best_epoch = history.history["val_accuracy"].index(best_val_acc) + 1
    print(f"\nBest val_accuracy: {best_val_acc:.4f} (epoch {best_epoch})")


if __name__ == "__main__":
    main()
