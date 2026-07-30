"""Check for exact and near-duplicate images across Training/Testing splits.

The EDA pass flagged 820 file-size-collision groups (1758 files) as a weak signal.
This does a real check: exact byte hash (confirms true duplicates) and a perceptual
hash (catches near-duplicates, e.g. re-compressed or slightly cropped versions of
the same slice) — specifically checking for leakage between Training and Testing,
which would inflate reported test accuracy.
"""
import hashlib
import os
from collections import defaultdict

import imagehash
from PIL import Image

from paths import DATASET_DIR

ROOT = str(DATASET_DIR)
SPLITS = ["Training", "Testing"]


def file_sha256(path, chunk_size=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


def collect_files():
    files = []
    for split in SPLITS:
        split_dir = os.path.join(ROOT, split)
        for cls in sorted(os.listdir(split_dir)):
            cls_dir = os.path.join(split_dir, cls)
            if not os.path.isdir(cls_dir):
                continue
            for fname in os.listdir(cls_dir):
                files.append((split, cls, os.path.join(cls_dir, fname)))
    return files


def main():
    files = collect_files()
    print(f"Scanning {len(files)} files for exact + perceptual duplicates...\n")

    exact_hash_map = defaultdict(list)  # sha256 -> [(split, cls, path)]
    phash_map = defaultdict(list)       # phash -> [(split, cls, path)]

    for i, (split, cls, path) in enumerate(files):
        if i % 1000 == 0:
            print(f"  {i}/{len(files)}...")
        sha = file_sha256(path)
        exact_hash_map[sha].append((split, cls, path))
        try:
            with Image.open(path) as img:
                ph = imagehash.phash(img)
            phash_map[str(ph)].append((split, cls, path))
        except Exception as e:
            print(f"  WARN: could not hash {path}: {e}")

    print("\n" + "=" * 60)
    print("EXACT DUPLICATES (identical file bytes)")
    print("=" * 60)
    exact_dupes = {k: v for k, v in exact_hash_map.items() if len(v) > 1}
    cross_split_exact = [v for v in exact_dupes.values()
                          if len({s for s, c, p in v}) > 1]
    within_split_exact = [v for v in exact_dupes.values()
                           if len({s for s, c, p in v}) == 1]
    print(f"  Total exact-duplicate groups: {len(exact_dupes)}")
    print(f"  Groups spanning Training+Testing (LEAKAGE): {len(cross_split_exact)}")
    print(f"  Groups within a single split only: {len(within_split_exact)}")
    if cross_split_exact:
        print("\n  Sample leakage cases:")
        for group in cross_split_exact[:10]:
            print(f"    {group}")

    print("\n" + "=" * 60)
    print("PERCEPTUAL NEAR-DUPLICATES (phash exact match, hamming distance 0)")
    print("=" * 60)
    phash_dupes = {k: v for k, v in phash_map.items() if len(v) > 1}
    cross_split_phash = [v for v in phash_dupes.values()
                          if len({s for s, c, p in v}) > 1]
    print(f"  Total perceptual-duplicate groups: {len(phash_dupes)}")
    print(f"  Groups spanning Training+Testing (LEAKAGE): {len(cross_split_phash)}")
    if cross_split_phash:
        print(f"  Files involved in cross-split perceptual dupes: "
              f"{sum(len(v) for v in cross_split_phash)}")
        print("\n  Sample leakage cases:")
        for group in cross_split_phash[:10]:
            print(f"    {group}")

    print("\n" + "=" * 60)
    print("VERDICT")
    print("=" * 60)
    if cross_split_exact or cross_split_phash:
        print("  LEAKAGE DETECTED between Training and Testing splits.")
        print("  Do not trust the Kaggle-provided split as-is for final evaluation.")
    else:
        print("  No exact or perceptual-hash duplicates found across "
              "Training/Testing splits.")
        print("  The provided split appears safe from this specific leakage risk.")


if __name__ == "__main__":
    main()
