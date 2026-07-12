"""Spot-check whether the RGB-mode images are genuinely color or just
grayscale data stored with 3 duplicated channels (common in aggregated medical
imaging datasets - depends on the export tool used by whichever source
contributed that image)."""
import csv
import random

import numpy as np
from PIL import Image

MANIFEST = r"D:\NeuralPath-AI-data\split_manifest.csv"
SEED = 42


def is_channel_duplicated(img_rgb_array):
    """True if R, G, B channels are (near) identical, i.e. it's grayscale
    stored as RGB, not real color content."""
    r, g, b = img_rgb_array[..., 0], img_rgb_array[..., 1], img_rgb_array[..., 2]
    return np.allclose(r, g, atol=2) and np.allclose(g, b, atol=2)


def main():
    manifest = list(csv.DictReader(open(MANIFEST)))
    rng = random.Random(SEED)

    rgb_files = []
    for row in manifest:
        try:
            with Image.open(row["filepath"]) as img:
                if img.mode == "RGB":
                    rgb_files.append(row["filepath"])
        except Exception:
            continue

    print(f"Found {len(rgb_files)} RGB-mode files in the manifest")
    sample = rng.sample(rgb_files, min(200, len(rgb_files)))

    duplicated = 0
    real_color = 0
    real_color_paths = []
    for path in sample:
        with Image.open(path) as img:
            arr = np.array(img.convert("RGB"))
        if is_channel_duplicated(arr):
            duplicated += 1
        else:
            real_color += 1
            real_color_paths.append(path)

    print(f"\nSampled {len(sample)} RGB-mode images:")
    print(f"  Channel-duplicated (i.e. actually grayscale): {duplicated}")
    print(f"  Genuine color content:                        {real_color}")

    if real_color_paths:
        print("\nFiles with genuine color content (for manual inspection):")
        for p in real_color_paths:
            print(f"  {p}")

    print(f"\nVerdict: {'RGB channel is redundant for the vast majority of RGB-mode images — safe to treat the whole dataset as effectively grayscale.' if duplicated > 0.9 * len(sample) else 'Meaningful real-color content found — do not blindly collapse to grayscale.'}")


if __name__ == "__main__":
    main()
