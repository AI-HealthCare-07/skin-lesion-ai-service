from datetime import datetime
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import relationship
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    birth_date = Column(Date, nullable=True)
    gender = Column(String(10), nullable=True)
    underlying_diseases = Column(JSON, default=list)
    drug_allergies = Column(JSON, default=list)
    regular_medications = Column(JSON, default=list)
    is_pregnant_or_nursing = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    records = relationship("SkinRecord", back_populates="user")
    schedules = relationship("MedicationSchedule", back_populates="user")


class SkinRecord(Base):
    __tablename__ = "skin_records"

    record_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    body_part = Column(String(50), nullable=False)
    symptoms_morphology = Column(JSON, default=list)
    itch_score = Column(Integer, default=0)
    pain_score = Column(Integer, default=0)
    duration = Column(String(50), nullable=True)
    user_memo = Column(Text, nullable=True)
    ocr_prescription_text = Column(Text, nullable=True)
    current_medications = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="records")
    images = relationship("LesionImage", back_populates="record")
    task = relationship("AnalysisTask", back_populates="record", uselist=False)


class LesionImage(Base):
    __tablename__ = "lesion_images"

    image_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    record_id = Column(
        Integer, ForeignKey("skin_records.record_id"), nullable=False
    )
    original_image_url = Column(String(512), nullable=False)
    gradcam_image_url = Column(String(512), nullable=True)
    image_type = Column(String(30), default="SMARTPHONE")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    record = relationship("SkinRecord", back_populates="images")


class AnalysisTask(Base):
    __tablename__ = "analysis_tasks"

    task_id = Column(String(36), primary_key=True, index=True)
    record_id = Column(
        Integer, ForeignKey("skin_records.record_id"), unique=True, nullable=False
    )
    status = Column(String(30), default="PENDING", nullable=False)
    progress_percent = Column(Integer, default=10)
    share_token = Column(String(128), unique=True, nullable=True, index=True)
    share_expires_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    record = relationship("SkinRecord", back_populates="task")
    screening_result = relationship(
        "ScreeningResult", back_populates="task", uselist=False
    )
    health_guide = relationship(
        "HealthGuide", back_populates="task", uselist=False
    )


class ScreeningResult(Base):
    __tablename__ = "screening_results"

    screening_id = Column(
        Integer, primary_key=True, index=True, autoincrement=True
    )
    task_id = Column(
        String(36),
        ForeignKey("analysis_tasks.task_id"),
        unique=True,
        nullable=False,
    )
    primary_disease_code = Column(String(50), nullable=False)
    primary_disease_name = Column(String(100), nullable=False)
    confidence_score = Column(Float, nullable=False)
    top3_candidates = Column(JSON, default=list)
    risk_level = Column(String(30), default="LOW")
    visual_finding_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("AnalysisTask", back_populates="screening_result")


class HealthGuide(Base):
    __tablename__ = "health_guides"

    guide_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(
        String(36),
        ForeignKey("analysis_tasks.task_id"),
        unique=True,
        nullable=False,
    )
    medication_guide = Column(JSON, default=list)
    ftu_dosage_guide = Column(JSON, default=dict)
    dur_warnings = Column(JSON, default=list)
    lifestyle_guide = Column(JSON, default=list)
    doctor_questions = Column(JSON, default=list)
    retrieved_sources = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("AnalysisTask", back_populates="health_guide")
    schedules = relationship("MedicationSchedule", back_populates="guide")


class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"

    schedule_id = Column(
        Integer, primary_key=True, index=True, autoincrement=True
    )
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    guide_id = Column(
        Integer, ForeignKey("health_guides.guide_id"), nullable=True
    )
    drug_name = Column(String(150), nullable=False)
    dosage_instruction = Column(String(255), nullable=False)
    alert_time = Column(Time, nullable=False)
    consecutive_days = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)

    user = relationship("User", back_populates="schedules")
    guide = relationship("HealthGuide", back_populates="schedules")