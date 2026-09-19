import os
import pandas as pd
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy import create_engine
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services.kpi_detector import detect_column_roles
from services.ai_insights import generate_dataset_insights, query_dataset_ai
from routes.auth import get_current_user
from routes.analytics import check_dataset_access

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()


class ChatQueryRequest(BaseModel):
    dataset_id: str
    query: Optional[str] = None
    message: Optional[str] = None


@router.get("/insights/{dataset_id}")
def get_insights(dataset_id: str, current_user: dict = Depends(get_current_user)):
    check_dataset_access(dataset_id, current_user["id"])
    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    analysis = generate_dataset_insights(df)

    return {
        "dataset_id": dataset_id,
        "insights": analysis["insights"],
        "recommendations": analysis["recommendations"],
        "summary": analysis.get("summary", "")
    }


@router.post("/chat")
@router.post("/insights/chat")
def chat_with_ai(request: ChatQueryRequest, current_user: dict = Depends(get_current_user)):
    dataset_id = request.dataset_id
    user_query = request.query or request.message or ""

    if not user_query.strip():
        raise HTTPException(status_code=400, detail="Query message cannot be empty.")

    check_dataset_access(dataset_id, current_user["id"])
    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    result = query_dataset_ai(df, user_query)

    return {
        "dataset_id": dataset_id,
        "query": user_query,
        "answer": result["answer"],
        "follow_ups": result.get("follow_ups", []),
        "metrics": result.get("metrics", {})
    }
