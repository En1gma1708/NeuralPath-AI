"""Single source of truth for where dataset/split/checkpoint data lives.

Canonical location is the external HDD (D:\\NeuralPath-AI-data\\), per
docs/CLAUDE.md. Temporarily pointed at a local_data/ folder on C: while
working without that drive attached - see docs/DEVLOG.md. To migrate back,
change DATA_ROOT below (and move the files); nothing else needs to change.
"""
from pathlib import Path

DATA_ROOT = Path(__file__).resolve().parent.parent / "local_data"
# DATA_ROOT = Path(r"D:\NeuralPath-AI-data")  # canonical location, once the external HDD is back

DATASET_DIR = DATA_ROOT / "dataset"
CHECKPOINTS_DIR = DATA_ROOT / "checkpoints"
SPLIT_MANIFEST = DATA_ROOT / "split_manifest.csv"
