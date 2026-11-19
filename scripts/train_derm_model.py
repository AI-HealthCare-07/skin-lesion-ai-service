import os
import argparse
import numpy as np
from PIL import Image, ImageDraw
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import datasets, models, transforms

# ai_worker/vision_model.py 와 동일한 5대 질환 클래스 순서
CLASS_NAMES = [
    "L23.9_contact_dermatitis",   # 0: 접촉성 피부염
    "L20.9_atopic_dermatitis",    # 1: 아토피 피부염
    "L21.9_seborrheic_dermatitis",# 2: 지루성 피부염
    "L40.9_psoriasis",            # 3: 건선
    "L50.9_acute_urticaria",      # 4: 급성 두드러기
]

WEIGHTS_SAVE_PATH = "ai_worker/weights/derm_resnet50.pth"


class SyntheticDermDataset(Dataset):
    """실제 데이터셋 다운로드 전 파이프라인 및 가중치 저장 검증용 합성 병변 데이터셋"""

    def __init__(self, num_samples: int = 50, transform=None):
        self.num_samples = num_samples
        self.transform = transform

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        label = idx % len(CLASS_NAMES)
        rng = np.random.default_rng(idx)
        base_color = (225 + int(rng.integers(-15, 15)), 185 + int(rng.integers(-15, 15)), 165)
        img = Image.new("RGB", (224, 224), color=base_color)
        draw = ImageDraw.Draw(img)

        # 클래스별 특징적인 병변 패턴 시뮬레이션
        lesion_colors = [
            (205, 70, 70),   # 접촉성: 선명한 홍반
            (185, 95, 95),   # 아토피: 건조 홍반
            (215, 130, 85),  # 지루성: 황적색 각질반
            (190, 60, 80),   # 건선: 경계 뚜렷한 판상
            (230, 120, 120), # 두드러기: 팽진
        ]
        draw.ellipse((60, 60, 164, 164), fill=lesion_colors[label])

        if self.transform:
            img = self.transform(img)
        return img, label


def train_model(data_dir: str, epochs: int, batch_size: int, lr: float, demo_mode: bool):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🚀 [MediGuide AI Trainer] 실행 장치: {device}")

    train_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    if demo_mode or not os.path.exists(data_dir):
        print("⚠️ 지정된 실제 데이터 폴더가 없거나 --demo 모드입니다. 합성 병변 데이터로 학습 파이프라인을 검증합니다.")
        dataset = SyntheticDermDataset(num_samples=40, transform=train_transform)
    else:
        print(f"📂 실제 피부 병변 데이터셋 로드 중: {data_dir}")
        dataset = datasets.ImageFolder(root=data_dir, transform=train_transform)

    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    # vision_model.py 와 100% 동일한 ResNet50 아키텍처 구성
    model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
    num_ftrs = model.fc.in_features
    model.fc = nn.Linear(num_ftrs, len(CLASS_NAMES))
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0

        for inputs, labels in dataloader:
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()

            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            _, preds = torch.max(outputs, 1)
            correct += torch.sum(preds == labels).item()
            total += labels.size(0)

        epoch_loss = running_loss / total
        epoch_acc = (correct / total) * 100.0
        print(f"Epoch [{epoch}/{epochs}] - Loss: {epoch_loss:.4f} | Train Acc: {epoch_acc:.2f}%")

    os.makedirs(os.path.dirname(WEIGHTS_SAVE_PATH), exist_ok=True)
    torch.save(model.state_dict(), WEIGHTS_SAVE_PATH)
    print(f"✅ 학습 완료! 모델 가중치가 저장되었습니다: {WEIGHTS_SAVE_PATH}")
    print("💡 이제 ai_worker를 재시작하면 vision_model.py가 해당 가중치를 자동으로 불러옵니다.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediGuide AI 피부 병변 분류 모델 학습기")
    parser.add_argument("--data_dir", type=str, default="data/derm_train", help="클래스별 하위 폴더가 있는 학습 이미지 경로")
    parser.add_argument("--epochs", type=int, default=3, help="학습 에포크 수")
    parser.add_argument("--batch_size", type=int, default=8, help="배치 크기")
    parser.add_argument("--lr", type=float, default=1e-4, help="학습률")
    parser.add_argument("--demo", action="store_true", help="합성 데이터로 파이프라인 즉시 검증")
    args = parser.parse_args()

    train_model(
        data_dir=args.data_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        demo_mode=args.demo,
    )