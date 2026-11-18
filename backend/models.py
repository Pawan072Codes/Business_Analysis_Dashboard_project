from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=True)
    email = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    datasets = relationship("Dataset", back_populates="owner", cascade="all, delete-orphan")
    settings = relationship("UserSetting", back_populates="owner", uselist=False, cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    row_count = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # User connection
    owner = relationship("User", back_populates="datasets")
    analytics = relationship("AnalyticsRecord", back_populates="dataset", cascade="all, delete-orphan")


class AnalyticsRecord(Base):
    __tablename__ = "analytics_records"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False, index=True)
    
    # Common metric fields
    date = Column(DateTime, nullable=True)
    category = Column(String(100), nullable=True)
    revenue = Column(Float, default=0.0)
    cost = Column(Float, default=0.0)
    attrition = Column(String(20), nullable=True)
    extra_data = Column(JSON, nullable=True)

    dataset = relationship("Dataset", back_populates="analytics")


class UserSetting(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    company_name = Column(String(150), nullable=True)
    currency = Column(String(10), default="USD")
    theme = Column(String(20), default="dark")
    notifications = Column(JSON, nullable=True)

    owner = relationship("User", back_populates="settings")