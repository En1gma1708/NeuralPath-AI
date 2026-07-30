"""EDA for the Kaggle Brain Tumor MRI Dataset at D:\\NeuralPath-AI-data\\dataset.

Reports per-split, per-class image counts, image size/format distribution, and
flags obvious quality issues (corrupt files, near-duplicate file sizes as a weak
duplicate signal). Read-only — does not modify the dataset.
"""
import os
from collections import Counter, defaultdict

from PIL import Image

from paths import DATASET_DIR

ROOT = str(DATASET_DIR)
SPLITS = ["Training", "Testing"]


def scan():
    counts = defaultdict(dict)
    formats = Counter()
    sizes = Counter()
    modes = Counter()
    corrupt = []
    total_files_by_hash_key = defaultdict(list)  # (size_bytes) -> [paths], weak dup signal

    for split in SPLITS:
        split_dir = os.path.join(ROOT, split)
        if not os.path.isdir(split_dir):
            continue
        for cls in sorted(os.listdir(split_dir)):
            cls_dir = os.path.join(split_dir, cls)
            if not os.path.isdir(cls_dir):
                continue
            files = [f for f in os.listdir(cls_dir) if not f.startswith(".")]
            counts[split][cls] = len(files)

            for fname in files:
                fpath = os.path.join(cls_dir, fname)
                try:
                    with Image.open(fpath) as img:
                        img.verify()
                    with Image.open(fpath) as img:
                        formats[img.format] += 1
                        modes[img.mode] += 1
                        sizes[img.size] += 1
                    fsize = os.path.getsize(fpath)
                    total_files_by_hash_key[fsize].append(fpath)
                except Exception as e:
                    corrupt.append((fpath, str(e)))

    return counts, formats, modes, sizes, corrupt, total_files_by_hash_key


def main():
    counts, formats, modes, sizes, corrupt, size_groups = scan()

    print("=" * 60)
    print("CLASS COUNTS PER SPLIT")
    print("=" * 60)
    grand_total = 0
    for split in SPLITS:
        split_total = sum(counts[split].values())
        grand_total += split_total
        print(f"\n{split} (total: {split_total})")
        for cls, n in sorted(counts[split].items()):
            print(f"  {cls:15s} {n:5d}")

    print(f"\nGRAND TOTAL: {grand_total} images")

    print("\n" + "=" * 60)
    print("IMAGE FORMATS")
    print("=" * 60)
    for fmt, n in formats.most_common():
        print(f"  {fmt:10s} {n:5d}")

    print("\n" + "=" * 60)
    print("COLOR MODES")
    print("=" * 60)
    for mode, n in modes.most_common():
        print(f"  {mode:10s} {n:5d}")

    print("\n" + "=" * 60)
    print("IMAGE SIZE DISTRIBUTION (top 10)")
    print("=" * 60)
    for size, n in sizes.most_common(10):
        print(f"  {str(size):15s} {n:5d}")
    print(f"  ... {len(sizes)} distinct sizes total")

    print("\n" + "=" * 60)
    print("CORRUPT / UNREADABLE FILES")
    print("=" * 60)
    if corrupt:
        for fpath, err in corrupt[:20]:
            print(f"  {fpath}: {err}")
        if len(corrupt) > 20:
            print(f"  ... and {len(corrupt) - 20} more")
    else:
        print("  None found.")

    print("\n" + "=" * 60)
    print("POTENTIAL EXACT DUPLICATES (same file size, weak signal only)")
    print("=" * 60)
    dup_groups = {k: v for k, v in size_groups.items() if len(v) > 1}
    print(f"  {len(dup_groups)} file-size groups with >1 file "
          f"({sum(len(v) for v in dup_groups.values())} files involved)")
    print("  (This is a weak/cheap signal, not a hash comparison — "
          "flags candidates for closer inspection, not confirmed duplicates.)")


if __name__ == "__main__":
    main()
