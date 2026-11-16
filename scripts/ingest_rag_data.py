import os
import uuid
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from sentence_transformers import SentenceTransformer

load_dotenv()

# 1. Qdrant 보안 연결 설정
QDRANT_HOST = os.getenv("QDRANT_HOST", "127.0.0.1")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

client = QdrantClient(
    url=f"http://{QDRANT_HOST}:{QDRANT_PORT}",
    api_key=QDRANT_API_KEY,
)

COLLECTION_NAME = "mediguide_knowledge"

# 2. 다국어/한국어 의학 검색에 강한 BAAI/bge-m3 임베딩 모델 로드
print("⏳ 임베딩 모델(BAAI/bge-m3) 로딩 중... (최초 실행 시 다운로드에 1~2분 소요)")
embedder = SentenceTransformer("BAAI/bge-m3")
VECTOR_SIZE = 1024  # bge-m3 출력 차원 수

# 3. 식약처 e약은요 · DUR 금기 · 피부과학회 FTU 지식 데이터 청크
KNOWLEDGE_CHUNKS = [
    {
        "doc_id": "MFDS_DERMOVATE_01",
        "drug_name": "더모베이트연고0.05%",
        "ingredient": "클로베타솔프로피오네이트",
        "category": "외피용제(스테로이드)",
        "steroid_potency_class": 1,
        "safe_for_face": False,
        "target_diseases": ["건선", "습진", "접촉성 피부염"],
        "organization": "식품의약품안전처 의약품안전나라(e약은요) & 심평원 DUR",
        "text": (
            "[더모베이트연고0.05% | 클로베타솔프로피오네이트 | 스테로이드 1등급(초강력)] "
            "효능·효과: 습진, 피부염군, 건선 등 중증 염증성 피부질환의 단기 완화. "
            "사용상 주의사항 및 DUR 부위 금기: 1등급 초강력 스테로이드 외용제이므로 피부가 얇은 "
            "안면부(얼굴), 눈 주위, 사타구니, 겨드랑이 부위에는 절대 임의로 도포하지 마십시오. "
            "얼굴 사용 시 피부 위축, 모세혈관 확장, 스테로이드성 주사(홍조) 부작용 위험이 매우 높습니다."
        ),
    },
    {
        "doc_id": "MFDS_LIDOMEX_02",
        "drug_name": "리도멕스크림0.15%",
        "ingredient": "프레드니솔론발레로아세테이트",
        "category": "외피용제(스테로이드)",
        "steroid_potency_class": 5,
        "safe_for_face": True,
        "target_diseases": ["아토피 피부염", "접촉성 피부염", "지루성 피부염"],
        "organization": "식품의약품안전처 의약품안전나라(e약은요)",
        "text": (
            "[리도멕스크림0.15% | 프레드니솔론발레로아세테이트 | 스테로이드 5등급(약함)] "
            "효능·효과: 습진, 피부염, 아토피 피부염, 지루성 피부염, 가려움증 완화. "
            "용법·용량: 1일 1~수회 환부에 적당량을 얇게 바릅니다. 비교적 순한 등급의 외용제로 "
            "전문의 지도하에 얼굴이나 목 등 민감한 부위에도 단기간 제한적으로 사용 가능하나, "
            "증상 호전 시 서서히 중단하고 연속 2주 이상 장기 연용을 피해야 합니다."
        ),
    },
    {
        "doc_id": "MFDS_EBASTEL_03",
        "drug_name": "에바스텔정10mg",
        "ingredient": "에바스틴",
        "category": "항히스타민제(경구약)",
        "steroid_potency_class": 0,
        "safe_for_face": True,
        "target_diseases": ["두드러기", "아토피 피부염", "알레르기성 피부염"],
        "organization": "식품의약품안전처 의약품안전나라(e약은요)",
        "text": (
            "[에바스텔정10mg | 에바스틴 | 2세대 항히스타민제] "
            "효능·효과: 만성 특발성 두드러기, 알레르기성 비염 및 피부질환에 동반되는 가려움증 완화. "
            "용법·용량: 성인 기준 1일 1회 10mg(1정)을 식사와 관계없이 경구 복용합니다. "
            "주의사항: 1세대에 비해 졸음이 적으나 개인에 따라 졸음이나 어지러움이 나타날 수 있으므로 "
            "복용 후 운전이나 위험한 기계 조작 시 주의하고, 알코올(음주) 병용을 피하십시오."
        ),
    },
    {
        "doc_id": "KDA_FTU_GUIDE_04",
        "drug_name": "외용 스테로이드제 FTU 정량 도포 가이드",
        "ingredient": "공통 외용제 도포 지침",
        "category": "대한피부과학회 진료지침",
        "steroid_potency_class": 0,
        "safe_for_face": True,
        "target_diseases": ["아토피 피부염", "접촉성 피부염", "건선", "습진"],
        "organization": "대한피부과학회 & 질병관리청",
        "text": (
            "[FTU(Finger Tip Unit) 정량 도포법 및 생활 관리 지침] "
            "1 FTU는 성인 검지 손가락 끝마디 길이만큼 연고를 짠 양(약 0.5g)으로, 성인 손바닥 2개 넓이의 피부에 바르는 적정량입니다. "
            "부위별 권장 도포량: 얼굴 및 목 전체(2.5 FTU), 한쪽 팔 전체(3 FTU), 한쪽 손(1 FTU), 몸통 앞면 또는 뒷면(7 FTU), 한쪽 다리 전체(6 FTU). "
            "도포 순서: 미온수(32~34°C) 세안 후 3분 이내에 보습제를 먼저 충분히 바르고, 15분 뒤 처방받은 연고를 병변 부위에만 얇게 펴 바르십시오."
        ),
    },
]


def ingest_data():
    # 4. 컬렉션 초기화 및 생성
    if client.collection_exists(COLLECTION_NAME):
        client.delete_collection(COLLECTION_NAME)
        print(f"🗑️ 기존 컬렉션 '{COLLECTION_NAME}' 초기화 완료")

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
    )
    print(f"📦 새 벡터 컬렉션 '{COLLECTION_NAME}' 생성 완료!")

    # 5. 텍스트 임베딩 및 Qdrant 업서트(Upsert)
    points = []
    for item in KNOWLEDGE_CHUNKS:
        vector = embedder.encode(item["text"]).tolist()
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, item["doc_id"]))
        points.append(
            PointStruct(
                id=point_id,
                vector=vector,
                payload=item,
            )
        )

    client.upsert(collection_name=COLLECTION_NAME, points=points)
    print(f"✅ 총 {len(points)}개의 의약품·가이드 지식 청크 Qdrant 적재 완료!")

    # 6. 검색 테스트 (안면부 스테로이드 주의사항 질의)
    test_query = "얼굴에 더모베이트 연고를 발라도 되나요? 도포량도 알려주세요."
    query_vector = embedder.encode(test_query).tolist()

    search_results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=2,
    ).points

    print("\n🔍 [RAG 검색 검증 테스트]")
    print(f"질의: '{test_query}'")
    for idx, hit in enumerate(search_results, 1):
        print(
            f"  {idx}위 (유사도 {hit.score:.4f}) -> [{hit.payload['doc_id']}] {hit.payload['drug_name']}"
        )


if __name__ == "__main__":
    ingest_data()