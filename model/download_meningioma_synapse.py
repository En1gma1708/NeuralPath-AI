"""Phase 2c: download meningioma slices from the BraTS Pre-operative
Meningioma Dataset (Synapse syn51514106) - see docs/NOVELTY_PLAN.md's Phase
2c section for why this is the only class with a genuinely accessible,
independently-sourced option (TCIA's MENINGIOMA-SEG-CLASS requires dbGaP
approval restricted to senior researchers, a hard wall for this project).

Runs in its own throwaway venv (local_data/external_validation/synapse_venv),
NOT training_env - synapseclient pulls in a protobuf version that breaks
TensorFlow 2.10 if installed in the same environment (confirmed by testing;
do not try to merge these into one env again).

Downloads the TRAINING zip (syn51514055, ~20.2GB, up to 1000 patients) - the
validation zip (syn51930467, tried first) has NO segmentation masks at all
(withheld for the challenge), which made tumor-guided slice selection
impossible and produced slices that often didn't show the tumor. Only the
training zip has masks, so it's the only way to replicate the same
mask-guided rigor used for the pituitary class.

Scratch/zip storage is on D: (external_validation's own folder), NOT
local_data/ on C: - a 20GB download has no business on the fast SSD reserved
for checkpoints. The zip is kept after the run (not auto-deleted) per
project convention - delete it yourself once you've confirmed the output
slices look right, not automatically on script exit.

Requires a Synapse account + personal access token (synapse.org, free
signup, no institutional gating) - set SYNAPSE_AUTH_TOKEN before running:
  $env:SYNAPSE_AUTH_TOKEN = "<token>"   (PowerShell)

Usage (from the synapse_venv):
  local_data/external_validation/synapse_venv/Scripts/python.exe \
      model/download_meningioma_synapse.py
"""
import os
import shutil
import zipfile
from pathlib import Path

import nibabel as nib
import numpy as np
import synapseclient
from PIL import Image

TRAINING_ZIP_ID = "syn51514055"
N_PATIENTS = 100
N_SLICES_PER_PATIENT = 3

DATA_ROOT = Path(r"D:\NeuralPath-AI-data")
OUT_DIR = DATA_ROOT / "external_validation" / "raw" / "meningioma"
SCRATCH_DIR = DATA_ROOT / "external_validation" / "_scratch_meningioma"


def _save_slice(arr, out_path):
    arr = arr.astype(np.float32)
    lo, hi = np.percentile(arr, [1, 99])
    if hi <= lo:
        return False
    arr = np.clip((arr - lo) / (hi - lo), 0, 1) * 255
    Image.fromarray(arr.astype(np.uint8), mode="L").save(out_path)
    return True


def main():
    token = os.environ.get("SYNAPSE_AUTH_TOKEN")
    if not token:
        raise SystemExit(
            "Set SYNAPSE_AUTH_TOKEN first - see this script's docstring."
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)

    syn = synapseclient.Synapse()
    syn.login(authToken=token)

    print("Downloading training zip (~20.2GB, this will take a while - "
          "syn.get() resumes/skips if already downloaded, safe to re-run)...")
    entity = syn.get(TRAINING_ZIP_ID, downloadLocation=str(SCRATCH_DIR))
    zip_path = Path(entity.path)
    print(f"Downloaded to {zip_path}")

    try:
        print("Listing zip contents...")
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            t1ce_names = [n for n in names
                          if ("t1c" in n.lower() or "t1ce" in n.lower())
                          and "seg" not in n.lower()
                          and (n.endswith(".nii") or n.endswith(".nii.gz"))]
            print(f"{len(t1ce_names)} T1-CE volumes found in the zip "
                  f"(of {len(names)} total entries).")
            if not t1ce_names:
                raise SystemExit(
                    "No T1-CE files matched - inspect the zip's naming "
                    "convention manually and fix the filter above."
                )

            rng = np.random.RandomState(42)
            idx = rng.choice(len(t1ce_names), size=min(N_PATIENTS, len(t1ce_names)),
                              replace=False)
            sample = [t1ce_names[i] for i in idx]

            saved = 0
            skipped_no_mask = 0
            skipped_no_tumor = 0
            for i, name in enumerate(sample, 1):
                pid = Path(name).stem.replace(".nii", "")
                print(f"  [{i}/{len(sample)}] {pid}...")
                # BraTS naming: BraTS-MEN-{id}-000-t1c.nii.gz /
                # BraTS-MEN-{id}-000-seg.nii.gz - same dir, swap the suffix.
                seg_name = name.replace("t1c", "seg").replace("t1ce", "seg")
                t1_extract_path = SCRATCH_DIR / "_extract" / name
                seg_extract_path = SCRATCH_DIR / "_extract" / seg_name
                try:
                    zf.extract(name, path=str(SCRATCH_DIR / "_extract"))
                    data = nib.load(str(t1_extract_path)).get_fdata()
                    # BraTS volumes are already in standard axial orientation
                    # (unlike IXI/OpenNeuro's raw scanner-native affines) -
                    # no canonical reorientation needed here.
                    axis = 2
                    n = data.shape[axis]

                    if seg_name in names:
                        zf.extract(seg_name, path=str(SCRATCH_DIR / "_extract"))
                        mask = nib.load(str(seg_extract_path)).get_fdata()
                        tumor_counts = (mask > 0).sum(axis=(0, 1))
                        if tumor_counts.sum() > 0:
                            best = int(np.argmax(tumor_counts))
                            candidates = sorted({max(0, min(n - 1, best + d))
                                                  for d in range(-1, 2)})[:N_SLICES_PER_PATIENT]
                        else:
                            skipped_no_tumor += 1
                            candidates = []
                    else:
                        skipped_no_mask += 1
                        mid = n // 2
                        candidates = [mid]

                    for j, sidx in enumerate(candidates):
                        sl = np.rot90(data[:, :, sidx])
                        out_path = OUT_DIR / f"{pid}_slice{j}.png"
                        if _save_slice(sl, out_path):
                            saved += 1
                except Exception as e:
                    print(f"    failed: {e}")
                finally:
                    if t1_extract_path.exists():
                        t1_extract_path.unlink()
                    if seg_extract_path.exists():
                        seg_extract_path.unlink()

        print(f"Done. {saved} slices saved to {OUT_DIR} "
              f"({skipped_no_mask} patients had no mask file, "
              f"{skipped_no_tumor} masks had zero tumor voxels)")
    finally:
        # Only remove the per-patient extracted NIfTI scratch dir (already
        # cleaned up file-by-file above) - deliberately NOT deleting the zip
        # itself here. It's the 20GB source of truth; if the slice output
        # above turns out wrong and needs re-extracting, re-downloading it
        # is expensive and avoidable. Delete zip_path yourself once you've
        # confirmed the output slices look correct, not automatically.
        extract_dir = SCRATCH_DIR / "_extract"
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)
        print(f"\nZip kept at {zip_path} - delete it yourself once you've "
              f"confirmed the slices above look right.")


if __name__ == "__main__":
    main()
