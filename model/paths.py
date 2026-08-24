"""Single source of truth for where dataset/split/checkpoint data lives.

Split across two roots as of 2026-08-21, once the external HDD (D:\\
NeuralPath-AI-data\\, a WD Elements USB HDD - confirmed via
Get-PhysicalDisk, genuinely slow: ~6 MB/s on real small-file I/O, not an
SSD) was reattached:
  - DATA_ROOT (D:): read-heavy, rarely-rewritten data - the raw dataset
    images and the Phase 2c external-validation set. Reading these
    repeatedly during training/eval is fine even on a slow HDD; nothing
    here gets rewritten mid-run.
  - FAST_DATA_ROOT (C:): checkpoints. Training/fine-tuning writes these
    repeatedly during a run - kept on the internal NVMe SSD so checkpoint
    saves don't bottleneck training on the HDD's slow write speed.
This is NOT "move everything to D: like the original plan assumed" - that
plan predates actually measuring the drive's real throughput.
"""
from pathlib import Path

DATA_ROOT = Path(r"D:\NeuralPath-AI-data")
FAST_DATA_ROOT = Path(__file__).resolve().parent.parent / "local_data"

DATASET_DIR = DATA_ROOT / "dataset"
CHECKPOINTS_DIR = FAST_DATA_ROOT / "checkpoints"
SPLIT_MANIFEST = FAST_DATA_ROOT / "split_manifest.csv"

# Phase 2c: composite external-validation set (4 independently-sourced,
# single-class collections - see docs/NOVELTY_PLAN.md's Phase 2c section for
# why no single dataset covers all 4 classes independently). Kept fully
# separate from DATASET_DIR - never mixed with training data.
EXTERNAL_VAL_DIR = DATA_ROOT / "external_validation"
EXTERNAL_VAL_RAW_DIR = EXTERNAL_VAL_DIR / "raw"       # as-downloaded (DICOM/NIfTI)
EXTERNAL_VAL_PROCESSED_DIR = EXTERNAL_VAL_DIR / "processed"  # 224x224 PNGs, training-pipeline-matched

# Phase 2c follow-up (2026-08-22): additional independently-provenanced
# TRAINING data per class (CFB-GBM/glioma, Figshare pituitary NET/pituitary,
# HCP Young Adult/notumor - meningioma has no viable source, see
# docs/NOVELTY_PLAN.md). Deliberately a separate root from both DATASET_DIR
# and EXTERNAL_VAL_DIR: these sources get MERGED into the training set (once
# leakage-verified), never held out for evaluation - mixing them into
# EXTERNAL_VAL_DIR would silently contaminate that measurement.
EXTRA_TRAIN_DIR = DATA_ROOT / "extra_train_data"
EXTRA_TRAIN_RAW_DIR = EXTRA_TRAIN_DIR / "raw"
EXTRA_TRAIN_PROCESSED_DIR = EXTRA_TRAIN_DIR / "processed"
