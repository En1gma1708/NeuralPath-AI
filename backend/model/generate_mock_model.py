import tensorflow as tf
from tensorflow.keras import layers, models
import os

def create_mock_model(save_path):
    """Creates a simple VGG-like model and saves it as VGGSKin.hp5 for testing."""
    model = models.Sequential([
        layers.Input(shape=(128, 128, 3)),
        layers.Conv2D(16, (3, 3), activation='relu'),
        layers.MaxPooling2D((2, 2)),
        layers.GlobalAveragePooling2D(),
        layers.Dense(4, activation='softmax')
    ])
    
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    
    # Save the model
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    model.save(save_path)
    print(f"Mock model saved to {save_path}")

if __name__ == "__main__":
    target_path = os.path.join(os.path.dirname(__file__), "VGGSKin.h5")
    create_mock_model(target_path)
