"""Phase 2c follow-up (2026-08-22): download additional pituitary TRAINING
data from the "Mapping Pituitary Neuroendocrine Tumors" dataset (Figshare,
Pandit et al., Scientific Data 2025, DOI 10.1038/s41597-024-04218-8) - 136
patients, National Hospital for Neurology and Neurosurgery, London. Verified
independent of the existing training lineage (Figshare Cheng2017/Sartaj
Bhuvaji/masoudnickparvar) by reading the paper's full reference list
directly - see docs/NOVELTY_PLAN.md's Phase 2c section.

This is a TRAINING-data source, not external validation - output goes to
EXTRA_TRAIN_RAW_DIR (paths.py), never EXTERNAL_VAL_RAW_DIR. Distinct from
the OpenNeuro ds006248 pituitary set already spent on external validation;
mixing the two would contaminate that held-out measurement.

Unlike the OpenNeuro/BraTS sources, this dataset is NOT per-patient files -
Figshare article 27894084 has exactly one large archive
(Pituitary_MRI_tumor_carotids.zip, ~44GB) covering all 136 patients, so
there's no way to fetch a partial sample - the full zip must download before
any per-patient extraction. Downloaded to D: (external HDD, plenty of room),
kept after the run (not auto-deleted) per project convention - delete it
yourself once you've confirmed the output slices look right.

Includes real tumor segmentation masks (*_tumour.nii.gz per patient), so
this uses the same mask-guided slice selection already proven for the
OpenNeuro pituitary set and the Synapse meningioma set, rather than blind
mid-volume sampling.

FIXED (2026-08-23): the first version of this script picked the slicing
axis via `argmin(shape)`, which for this dataset's ~isotropic 0.5mm volumes
picked the AXIAL axis - a wide-field view showing eye sockets/skull base.
The EXISTING training data's pituitary images (Kaggle/Cheng2017 lineage)
are predominantly CORONAL/sagittal close-ups centered on the tumor. This
plane mismatch was confirmed (visually, by reading sample images from both
sources side by side) to be the root cause of a real external-validation
accuracy regression after merging (68.45% -> 65.11%): the model learned
"axial wide-field skull-base" as a spurious pituitary shortcut, which then
misfired against external glioma cases (also axial) at a high rate. Fixed
by hardcoding the coronal axis (axis=1 in this dataset's (sag, cor, ax)
volume orientation, confirmed by extracting and visually checking a
mid-slice from all 3 axes) instead of inferring it from shape.

No login/application required - confirmed via a direct, unauthenticated
call to the public Figshare API (api.figshare.com/v2/articles/27894084).

Usage: python download_pituitary_extra_train.py
"""
import zipfile
from pathlib import Path

import nibabel as nib
import numpy as np
import requests
from PIL import Image

from paths import EXTRA_TRAIN_RAW_DIR

ARTICLE_ID = 27894084
ZIP_FILENAME = "Pituitary_MRI_tumor_carotids.zip"
N_SLICES_PER_PATIENT = 3

DATA_ROOT = Path(r"D:\NeuralPath-AI-data")
OUT_DIR = EXTRA_TRAIN_RAW_DIR / "pituitary"
SCRATCH_DIR = DATA_ROOT / "extra_train_data" / "_scratch_pituitary"


def _center_crop_square(arr):
    """The existing training images are all 512x512 square; this dataset's
    coronal slices are not (e.g. ~404x342), and data_pipeline.py's plain
    tf.image.resize would stretch a non-square slice non-uniformly - a
    geometric distortion the original training data never has. Center-crop
    to square first so resize-to-224 only scales, never stretches."""
    h, w = arr.shape
    side = min(h, w)
    top = (h - side) // 2
    left = (w - side) // 2
    return arr[top:top + side, left:left + side]


def _save_slice(arr, out_path):
    arr = _center_crop_square(arr)
    arr = arr.astype(np.float32)
    lo, hi = np.percentile(arr, [1, 99])
    if hi <= lo:
        return False
    arr = np.clip((arr - lo) / (hi - lo), 0, 1) * 255
    Image.fromarray(arr.astype(np.uint8), mode="L").save(out_path)
    return True


def _download_zip(zip_path, max_retries=10):
    """Real HTTP Range resume: a first attempt at this (2026-08-22) died
    silently ~21GB into the ~44GB pull (background process killed, no
    Python traceback - looked like a network drop or the host terminating
    a long-lived connection) and had to restart from byte 0, wasting ~3.5
    hours at this drive's ~6MB/s. This version resumes from the partial
    file's actual size via a Range header, and retries on connection drops
    instead of treating one as fatal - a single ~44GB HTTP stream is prone
    to exactly this kind of mid-transfer failure, not a one-off fluke."""
    print("Fetching Figshare article metadata...")
    meta = requests.get(f"https://api.figshare.com/v2/articles/{ARTICLE_ID}").json()
    file_entry = next(
        (f for f in meta["files"] if f["name"] == ZIP_FILENAME), None
    )
    if file_entry is None:
        raise SystemExit(
            f"Could not find {ZIP_FILENAME} in article {ARTICLE_ID}'s file "
            f"list - files present: {[f['name'] for f in meta['files']]}"
        )
    download_url = file_entry["download_url"]
    total = file_entry["size"]

    if zip_path.exists() and zip_path.stat().st_size >= total:
        print(f"{zip_path} already present and complete-sized, skipping download.")
        return

    for attempt in range(1, max_retries + 1):
        downloaded = zip_path.stat().st_size if zip_path.exists() else 0
        if downloaded >= total:
            break
        headers = {"Range": f"bytes={downloaded}-"} if downloaded else {}
        mode = "ab" if downloaded else "wb"
        print(f"[attempt {attempt}/{max_retries}] Downloading {ZIP_FILENAME} "
              f"({total / 1e9:.2f} GB) from byte {downloaded} "
              f"({downloaded / 1e9:.2f} GB already present)...")
        try:
            with requests.get(download_url, headers=headers, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(zip_path, mode) as f:
                    last_report = downloaded
                    for chunk in r.iter_content(chunk_size=1024 * 1024 * 8):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if downloaded - last_report >= 1024 * 1024 * 500:
                            print(f"  {downloaded / 1e9:.2f} / {total / 1e9:.2f} GB...")
                            last_report = downloaded
        except (requests.exceptions.RequestException, ConnectionError) as e:
            print(f"  connection dropped: {e}. Will resume from "
                  f"{zip_path.stat().st_size if zip_path.exists() else 0} bytes.")
            continue

    final_size = zip_path.stat().st_size if zip_path.exists() else 0
    if final_size < total:
        raise SystemExit(
            f"Download incomplete after {max_retries} attempts: "
            f"{final_size / 1e9:.2f} / {total / 1e9:.2f} GB. Re-run the "
            f"script to keep resuming - progress is preserved."
        )
    print("Download complete.")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = SCRATCH_DIR / ZIP_FILENAME

    _download_zip(zip_path)

    print("Listing zip contents...")
    with zipfile.ZipFile(zip_path) as zf:
        # Confirmed via a direct HTTP range-request peek at the zip's
        # central directory (no full download needed): real naming is
        # "{pid}_T1.nii.gz" / "{pid}_tumor_f.nii.gz" / "{pid}_T2_f.nii.gz" /
        # "{pid}_carotids_f.nii.gz", plus macOS-zip junk entries under
        # "__MACOSX/" that must be excluded.
        names = [n for n in zf.namelist() if not n.startswith("__MACOSX/")]
        t1_names = [n for n in names if n.lower().endswith("_t1.nii.gz")]
        print(f"{len(t1_names)} T1 volumes found (of {len(names)} total entries).")
        if not t1_names:
            raise SystemExit(
                "No T1 files matched the expected '*_T1.nii.gz' naming - "
                "inspect the zip's actual naming convention and fix the "
                "filter above. First 20 entries for reference: "
                f"{names[:20]}"
            )

        saved = 0
        skipped_no_mask = 0
        skipped_no_tumor = 0
        extract_dir = SCRATCH_DIR / "_extract"
        for i, name in enumerate(t1_names, 1):
            pid = Path(name).name.replace("_T1.nii.gz", "")
            print(f"  [{i}/{len(t1_names)}] {pid}...")
            mask_name = name.replace("_T1.nii.gz", "_tumor_f.nii.gz")
            t1_path = extract_dir / name
            mask_path = extract_dir / mask_name
            try:
                zf.extract(name, path=str(extract_dir))
                data = nib.load(str(t1_path)).get_fdata()
                # Coronal axis, hardcoded - see the module docstring's
                # 2026-08-23 fix note for why this replaced argmin(shape).
                axis = 1
                n = data.shape[axis]

                if mask_name in names:
                    zf.extract(mask_name, path=str(extract_dir))
                    mask = nib.load(str(mask_path)).get_fdata()
                    tumor_counts = (mask > 0).sum(
                        axis=tuple(a for a in range(3) if a != axis)
                    )
                    if tumor_counts.sum() > 0:
                        best = int(np.argmax(tumor_counts))
                        candidates = sorted({
                            max(0, min(n - 1, best + d)) for d in range(-1, 2)
                        })[:N_SLICES_PER_PATIENT]
                    else:
                        skipped_no_tumor += 1
                        candidates = [n // 2]
                else:
                    skipped_no_mask += 1
                    candidates = [n // 2]

                for j, sidx in enumerate(candidates):
                    sl = np.rot90(np.take(data, sidx, axis=axis))
                    out_path = OUT_DIR / f"{pid}_slice{j}.png"
                    if _save_slice(sl, out_path):
                        saved += 1
            except Exception as e:
                print(f"    failed: {e}")
            finally:
                if t1_path.exists():
                    t1_path.unlink()
                if mask_path.exists():
                    mask_path.unlink()

    print(f"Done. {saved} slices saved to {OUT_DIR} "
          f"({skipped_no_mask} patients had no mask file, "
          f"{skipped_no_tumor} masks had zero tumor voxels)")
    print(f"\nZip kept at {zip_path} - delete it yourself once you've "
          f"confirmed the slices above look right.")


if __name__ == "__main__":
    main()
