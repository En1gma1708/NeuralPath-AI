"""Build a leakage-safe stratified train/val/test split.

check_duplicates.py found 294 perceptual-hash duplicate groups spanning Kaggle's
provided Training/Testing folders (855 files, ~12% of the dataset) - almost
certainly near-identical slices from the same scan appearing in both. Splitting
naively (or trusting the provided split) risks a model partly memorizing a scan
from training and being "tested" on a near-duplicate of it, inflating accuracy.

Fix: pool ALL images (ignore the provided Training/Testing folders), group by
perceptual-hash cluster (near-duplicates always stay together), then split
clusters - not individual images - into train/val/test. This guarantees no
near-duplicate crosses a split boundary. Stratified by class at the cluster
level, fixed seed for reproducibility.

Output: a CSV manifest (filepath, class, split) at
D:\\NeuralPath-AI-data\\split_manifest.csv - training code should read this
rather than walking the Training/Testing folders directly.
"""
import csv
import os
import random
from collections import defaultdict

import imagehash
from PIL import Image

ROOT = r"D:\NeuralPath-AI-data\dataset"
SPLITS = ["Training", "Testing"]
OUT_CSV = r"D:\NeuralPath-AI-data\split_manifest.csv"

SEED = 42
TRAIN_FRAC = 0.70
VAL_FRAC = 0.15
TEST_FRAC = 0.15  # implied, kept explicit for clarity


def collect_files():
    files = []
    for split in SPLITS:
        split_dir = os.path.join(ROOT, split)
        for cls in sorted(os.listdir(split_dir)):
            cls_dir = os.path.join(split_dir, cls)
            if not os.path.isdir(cls_dir):
                continue
            for fname in os.listdir(cls_dir):
                files.append((cls, os.path.join(cls_dir, fname)))
    return files


def build_clusters(files):
    """Union-find over phash to group near-duplicates (hamming distance 0 on
    64-bit phash, same threshold used in check_duplicates.py) into clusters."""
    phash_to_files = defaultdict(list)
    file_class = {}
    for cls, path in files:
        try:
            with Image.open(path) as img:
                ph = str(imagehash.phash(img))
        except Exception as e:
            print(f"  WARN: could not hash {path}: {e}")
            continue
        phash_to_files[ph].append(path)
        file_class[path] = cls

    clusters = []
    for ph, paths in phash_to_files.items():
        cluster_cls = file_class[paths[0]]
        clusters.append({"class": cluster_cls, "files": paths})
    return clusters


def stratified_cluster_split(clusters, seed=SEED):
    rng = random.Random(seed)
    by_class = defaultdict(list)
    for c in clusters:
        by_class[c["class"]].append(c)

    manifest = []
    for cls, cls_clusters in sorted(by_class.items()):
        rng.shuffle(cls_clusters)
        n = len(cls_clusters)
        n_train = int(n * TRAIN_FRAC)
        n_val = int(n * VAL_FRAC)

        splits_for_class = (
            [("train", c) for c in cls_clusters[:n_train]]
            + [("val", c) for c in cls_clusters[n_train:n_train + n_val]]
            + [("test", c) for c in cls_clusters[n_train + n_val:]]
        )
        for split_name, cluster in splits_for_class:
            for path in cluster["files"]:
                manifest.append((path, cls, split_name))

    return manifest


def main():
    print("Collecting files...")
    files = collect_files()
    print(f"  {len(files)} files found across {ROOT}")

    print("Hashing and clustering near-duplicates (this takes a few minutes)...")
    clusters = build_clusters(files)
    total_files_in_clusters = sum(len(c["files"]) for c in clusters)
    print(f"  {len(clusters)} clusters from {total_files_in_clusters} files "
          f"(clusters >1 file = near-duplicate groups kept together)")

    print("Building stratified split at the cluster level...")
    manifest = stratified_cluster_split(clusters)

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["filepath", "class", "split"])
        writer.writerows(manifest)

    print(f"\nWrote manifest: {OUT_CSV} ({len(manifest)} rows)")

    counts = defaultdict(lambda: defaultdict(int))
    for _, cls, split in manifest:
        counts[split][cls] += 1
    print("\nFinal split composition:")
    for split in ["train", "val", "test"]:
        total = sum(counts[split].values())
        print(f"  {split:6s} total={total}")
        for cls, n in sorted(counts[split].items()):
            print(f"    {cls:12s} {n:5d}")


if __name__ == "__main__":
    main()
