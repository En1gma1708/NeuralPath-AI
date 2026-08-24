"""Phase 2c: download + extract 2D slices for the composite external-validation
set (see docs/NOVELTY_PLAN.md's Phase 2c section for full sourcing rationale -
why no single dataset covers all 4 classes with independent provenance).

Each source is a different format/access method, so this is one script per
class rather than a generic downloader:
  - Glioma: TCIA UPENN-GBM, via tcia_utils (DICOM)
  - Pituitary: OpenNeuro ds006248, via the OpenNeuro S3 bucket (NIfTI/BIDS)
  - No-tumor: IXI Dataset, via the Yeh-lab GitHub Releases mirror (the
    original brain-development.org host 403s on direct/scripted requests -
    this mirror re-hosts the same CC BY-SA data as individually downloadable
    per-subject NIfTI files)
  - Meningioma: not handled here - the only independent source found
    (TCIA MENINGIOMA-SEG-CLASS) is access-gated (desktop NBIA Data Retriever
    + possible NIH Controlled Access approval), see docs/NOVELTY_PLAN.md.

Extracts a small number of representative 2D axial slices per patient/subject
(not full 3D volumes) to keep this a manageable, Kaggle-training-set-scale
sample rather than importing tens of thousands of volume slices.

Usage: python download_external_validation.py glioma
       python download_external_validation.py pituitary
       python download_external_validation.py notumor
"""
import argparse

import numpy as np
import pydicom
import requests
from PIL import Image

from paths import EXTERNAL_VAL_RAW_DIR

N_PATIENTS_GLIOMA = 100
N_SUBJECTS_NOTUMOR = 100
N_SLICES_PER_PATIENT = 3


def _save_slice(arr, out_path):
    """Normalize a 2D array to 8-bit grayscale and save as PNG."""
    arr = arr.astype(np.float32)
    lo, hi = np.percentile(arr, [1, 99])
    if hi <= lo:
        return False
    arr = np.clip((arr - lo) / (hi - lo), 0, 1) * 255
    img = Image.fromarray(arr.astype(np.uint8), mode="L")
    img.save(out_path)
    return True


def download_glioma():
    """UPENN-GBM: sample N_PATIENTS_GLIOMA patients' T1-post-contrast series,
    extract N_SLICES_PER_PATIENT mid-volume axial slices from each. Downloads
    each series' DICOM files to a scratch folder, extracts slices, then
    deletes the DICOM - keeps disk usage to slices only, not full volumes."""
    import shutil
    import tempfile
    from pathlib import Path

    from tcia_utils import nbia

    out_dir = EXTERNAL_VAL_RAW_DIR / "glioma"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Querying UPENN-GBM series list...")
    df = nbia.getSeries(collection="UPENN-GBM", format="df")
    t1post = df[df["SeriesDescription"].str.contains(
        "T1.*POST|T1.*post", case=False, na=False, regex=True)]
    one_per_patient = t1post.drop_duplicates(subset="PatientID", keep="first")
    sample = one_per_patient.sample(n=min(N_PATIENTS_GLIOMA, len(one_per_patient)),
                                     random_state=42)
    print(f"Sampling {len(sample)} patients.")

    saved = 0
    scratch = Path(tempfile.mkdtemp(prefix="upenn_gbm_"))
    try:
        for i, row in enumerate(sample.itertuples(), 1):
            print(f"  [{i}/{len(sample)}] patient {row.PatientID}...")
            try:
                nbia.downloadSeries(
                    [{"SeriesInstanceUID": row.SeriesInstanceUID}],
                    path=str(scratch),
                )
            except Exception as e:
                print(f"    download failed: {e}")
                continue

            dicom_files = sorted(scratch.glob("**/*.dcm"))
            if not dicom_files:
                print("    no DICOM files found after download, skipping")
                continue

            slices = []
            for f in dicom_files:
                try:
                    ds = pydicom.dcmread(f)
                    slices.append((float(ds.get("InstanceNumber", 0)), ds.pixel_array))
                except Exception:
                    continue
            if not slices:
                print("    no readable DICOM slices, skipping")
                continue
            slices.sort(key=lambda t: t[0])

            n = len(slices)
            mid = n // 2
            offsets = [-n // 6, 0, n // 6][:N_SLICES_PER_PATIENT]
            for j, off in enumerate(offsets):
                idx = max(0, min(n - 1, mid + off))
                out_path = out_dir / f"{row.PatientID}_slice{j}.png"
                if _save_slice(slices[idx][1], out_path):
                    saved += 1

            shutil.rmtree(scratch, ignore_errors=True)
            scratch.mkdir(exist_ok=True)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)

    print(f"Done. {saved} slices saved to {out_dir}")


def download_pituitary():
    """OpenNeuro ds006248: pull COR CE-T1 NIfTI + its expert ground-truth
    tumor segmentation mask for each subject, extract the slice(s) with the
    most tumor-labeled voxels (not blind mid-volume sampling - this
    acquisition is only ~11 coronal slices covering the whole brain, and
    testing showed the tumor isn't reliably near the geometric middle slice).
    The mask is used only here, at data-prep time, to pick a representative
    slice - it never touches the model or any inference path."""
    import boto3
    from botocore import UNSIGNED
    from botocore.config import Config
    import nibabel as nib
    import tempfile
    import os

    out_dir = EXTERNAL_VAL_RAW_DIR / "pituitary"
    out_dir.mkdir(parents=True, exist_ok=True)

    s3 = boto3.client("s3", config=Config(signature_version=UNSIGNED))
    bucket = "openneuro.org"
    prefix = "ds006248/"

    resp = requests.post(
        "https://openneuro.org/crn/graphql",
        json={"query": 'query { dataset(id: "ds006248") { latestSnapshot { summary { subjects } } } }'},
    ).json()
    subjects = resp["data"]["dataset"]["latestSnapshot"]["summary"]["subjects"]
    print(f"{len(subjects)} subjects available.")

    saved = 0
    for i, sub in enumerate(subjects, 1):
        anat_prefix = f"{prefix}sub-{sub}/anat/"
        mask_key = f"{prefix}derivatives/segmentations/sub-{sub}/anat/sub-{sub}_label-groundTruth.nii.gz"
        try:
            listing = s3.list_objects_v2(Bucket=bucket, Prefix=anat_prefix)
        except Exception as e:
            print(f"  [{i}/{len(subjects)}] sub-{sub}: list failed: {e}")
            continue
        contents = listing.get("Contents", [])
        # CECor (coronal contrast-enhanced T1) is present for 100% of subjects
        # per the dataset's own readme - prefer it specifically over other CE
        # acquisitions (CE3DNavigation, CESag) which aren't universal.
        ce_t1_key = next(
            (o["Key"] for o in contents if "acq-CECor_T1w.nii.gz" in o["Key"]), None
        )
        if ce_t1_key is None:
            print(f"  [{i}/{len(subjects)}] sub-{sub}: no CECor T1 NIfTI found, skipping")
            continue

        print(f"  [{i}/{len(subjects)}] sub-{sub}: {ce_t1_key}")
        t1_path = mask_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
                s3.download_fileobj(bucket, ce_t1_key, tmp)
                t1_path = tmp.name
            try:
                with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
                    s3.download_fileobj(bucket, mask_key, tmp)
                    mask_path = tmp.name
            except Exception:
                mask_path = None  # no ground-truth mask for this subject

            data = nib.load(t1_path).get_fdata()
            axis = int(np.argmin(data.shape))  # through-plane axis (coronal here)
            n = data.shape[axis]

            if mask_path is not None:
                mask = nib.load(mask_path).get_fdata()
                tumor_counts = (mask == 1).sum(axis=tuple(a for a in range(3) if a != axis))
                if tumor_counts.sum() > 0:
                    best = int(np.argmax(tumor_counts))
                    # slices around the peak, clamped to the volume
                    candidates = sorted({max(0, min(n - 1, best + d))
                                          for d in range(-1, 2)})[:N_SLICES_PER_PATIENT]
                else:
                    candidates = [n // 2]
            else:
                candidates = [n // 2]

            for j, idx in enumerate(candidates):
                sl = np.rot90(np.take(data, idx, axis=axis))
                out_path = out_dir / f"sub-{sub}_slice{j}.png"
                if _save_slice(sl, out_path):
                    saved += 1
        except Exception as e:
            print(f"    slice extraction failed: {e}")
        finally:
            if t1_path:
                os.remove(t1_path)
            if mask_path:
                os.remove(mask_path)

    print(f"Done. {saved} slices saved to {out_dir}")


def download_notumor():
    """IXI Dataset (healthy volunteers) via the Yeh-lab GitHub Releases
    mirror - the original brain-development.org host returns 403 on direct/
    scripted requests. Extracts a representative axial slice per subject
    using nibabel's canonical (RAS+) reorientation, since IXI's raw affines
    are oblique (not simple axis-aligned axial acquisitions) - a naive
    array-axis slice produced a near-sagittal view during testing."""
    import shutil
    import tempfile
    from pathlib import Path

    import nibabel as nib

    out_dir = EXTERNAL_VAL_RAW_DIR / "notumor"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Querying IXI Hammersmith Hospital release assets...")
    resp = requests.get(
        "https://api.github.com/repos/data-others/brain/releases/tags/ixi-hh"
    ).json()
    t1_assets = [a for a in resp["assets"] if a["name"].endswith("_T1w.nii.gz")]
    print(f"{len(t1_assets)} T1 subjects available.")

    rng = np.random.RandomState(42)
    sample = rng.choice(t1_assets, size=min(N_SUBJECTS_NOTUMOR, len(t1_assets)),
                         replace=False)

    saved = 0
    scratch = Path(tempfile.mkdtemp(prefix="ixi_"))
    try:
        for i, asset in enumerate(sample, 1):
            sub_id = asset["name"].replace("_T1w.nii.gz", "")
            print(f"  [{i}/{len(sample)}] {sub_id}...")
            tmp_path = scratch / asset["name"]
            try:
                r = requests.get(asset["browser_download_url"], timeout=60)
                r.raise_for_status()
                tmp_path.write_bytes(r.content)
            except Exception as e:
                print(f"    download failed: {e}")
                continue

            try:
                img = nib.load(str(tmp_path))
                canon = nib.as_closest_canonical(img)
                data = canon.get_fdata()
                n = data.shape[2]  # axial axis in canonical RAS+ orientation
                # ~65-70% depth: representative mid-brain axial slice
                # (ventricles/cortex visible) - verified visually during dev,
                # the exact geometric-center slice (50%) skews toward the
                # skull base rather than a typical training-set-like framing.
                fracs = [0.60, 0.65, 0.70][:N_SLICES_PER_PATIENT]
                for j, frac in enumerate(fracs):
                    idx = max(0, min(n - 1, int(n * frac)))
                    sl = np.rot90(data[:, :, idx])
                    out_path = out_dir / f"{sub_id}_slice{j}.png"
                    if _save_slice(sl, out_path):
                        saved += 1
            except Exception as e:
                print(f"    slice extraction failed: {e}")
            finally:
                tmp_path.unlink(missing_ok=True)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)

    print(f"Done. {saved} slices saved to {out_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("cls", choices=["glioma", "pituitary", "notumor"])
    args = parser.parse_args()

    if args.cls == "glioma":
        download_glioma()
    elif args.cls == "notumor":
        download_notumor()
    elif args.cls == "pituitary":
        download_pituitary()
