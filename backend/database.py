import os
from urllib.parse import quote_plus
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# DATABASE_URL이 없으면 .env의 개별 MySQL 변수를 자동으로 조립
if not DATABASE_URL:
    user = os.getenv("MYSQL_USER") or os.getenv("DB_USER")
    password = os.getenv("MYSQL_PASSWORD") or os.getenv("DB_PASSWORD")
    host = os.getenv("MYSQL_HOST") or os.getenv("DB_HOST", "127.0.0.1")
    port = os.getenv("MYSQL_PORT") or os.getenv("DB_PORT", "3306")
    db_name = os.getenv("MYSQL_DATABASE") or os.getenv("DB_NAME")

    if not all([user, password, db_name]):
        raise RuntimeError(
            "MySQL 접속 정보(DATABASE_URL 또는 MYSQL_USER/PASSWORD/DATABASE)가 .env에 없습니다."
        )

    # 비밀번호에 특수문자가 있어도 안전하게 인코딩
    DATABASE_URL = (
        f"mysql+pymysql://{user}:{quote_plus(password)}@{host}:{port}/{db_name}"
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()