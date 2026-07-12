"""Download the Kaggle Brain Tumor MRI Dataset (masoudnickparvar) to D:\\NeuralPath-AI-data\\dataset.

Usage: python download_dataset.py
Requires Kaggle API credentials at C:\\Users\\<user>\\.kaggle\\kaggle.json.
"""
import os
import shutil

import kagglehub

DEST = r"D:\NeuralPath-AI-data\dataset"

if __name__ == "__main__":
    print("Downloading masoudnickparvar/brain-tumor-mri-dataset via kagglehub...")
    path = kagglehub.dataset_download("masoudnickparvar/brain-tumor-mri-dataset")
    print(f"Downloaded to kagglehub cache: {path}")

    os.makedirs(DEST, exist_ok=True)
    for item in os.listdir(path):
        src_item = os.path.join(path, item)
        dst_item = os.path.join(DEST, item)
        if os.path.isdir(src_item):
            shutil.copytree(src_item, dst_item, dirs_exist_ok=True)
        else:
            shutil.copy2(src_item, dst_item)

    print(f"Copied dataset to: {DEST}")
