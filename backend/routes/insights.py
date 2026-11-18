import io
import os
import csv
from datetime import datetime, timezone
import pandas as pd
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from sqlalchemy import create_engine
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services.ai_insights import (
    get_or_generate_dataset_insights,
    query_dataset_ai,
    generate_dataset_insights
)
from services.email_service import send_email
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
def get_insights_route(
    dataset_id: str,
    regenerate: bool = Query(default=False),
    current_user: dict = Depends(get_current_user)
):
    """
    Returns AI Insights for the selected cleaned dataset:
    - key_takeaway: single bold sentence summarizing top finding
    - insights: 4 cards (performance, growth, risk, recommendation) with text, key_number, mini_chart_data
    - forecast_outlook: short-term outlook (trend direction, growth %, confidence level)
    - generated_at: ISO timestamp
    - cached: bool
    """
    check_dataset_access(dataset_id, current_user["id"])

    try:
        data = get_or_generate_dataset_insights(
            dataset_id=dataset_id,
            user_id=current_user["id"],
            regenerate=regenerate
        )
        return data
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to generate AI insights for dataset '{dataset_id}'. Please verify data connection."
        )


@router.get("/insights/{dataset_id}/download")
def download_insights_report(
    dataset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Generates and returns an executive CSV summary report containing the AI insights,
    key takeaway, proof numbers, forecast outlook, and verified dataset facts.
    """
    check_dataset_access(dataset_id, current_user["id"])

    try:
        data = get_or_generate_dataset_insights(
            dataset_id=dataset_id,
            user_id=current_user["id"],
            regenerate=False
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate insights report: {str(e)}")

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["# BIZVISION AI BUSINESS INSIGHTS REPORT"])
    writer.writerow(["# Dataset ID", dataset_id])
    writer.writerow(["# Generated At", data.get("generated_at", "")])
    writer.writerow(["# Status", data.get("ai_status", "success")])
    writer.writerow([])
    writer.writerow(["=== EXECUTIVE KEY TAKEAWAY ==="])
    writer.writerow([data.get("key_takeaway", "")])
    writer.writerow([])
    writer.writerow(["=== CATEGORIZED INSIGHT CARDS ==="])
    writer.writerow(["Type", "Title", "Key Proof Number", "Insight Text"])

    for item in data.get("insights", []):
        writer.writerow([
            item.get("type", "").upper(),
            item.get("title", ""),
            item.get("key_number", ""),
            item.get("text", "")
        ])

    writer.writerow([])
    writer.writerow(["=== SHORT-TERM FORECAST OUTLOOK (1-3 MONTHS) ==="])
    fc = data.get("forecast_outlook", {})
    writer.writerow(["Trend Direction", fc.get("trend_label", "")])
    writer.writerow(["Expected Growth", fc.get("expected_growth_str", "")])
    writer.writerow(["Confidence Level", fc.get("confidence_level", "")])
    writer.writerow(["Summary", fc.get("forecast_summary", "")])

    writer.writerow([])
    writer.writerow(["=== VERIFIED BASELINE FACTS ==="])
    facts = data.get("calculated_facts", {})
    for k, v in facts.items():
        writer.writerow([k.replace("_", " ").title(), v])

    csv_content = output.getvalue()
    filename = f"ai_insights_{dataset_id}.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/insights/{dataset_id}/email")
def send_insights_email_route(
    dataset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Sends the generated AI insights summary report directly to the logged-in user's email.
    """
    check_dataset_access(dataset_id, current_user["id"])
    user_email = current_user["email"]

    try:
        data = get_or_generate_dataset_insights(
            dataset_id=dataset_id,
            user_id=current_user["id"],
            regenerate=False
        )

        insights_text = "\n".join([
            f"• [{item.get('type', '').upper()}] ({item.get('key_number', '')}): {item.get('text', '')}"
            for item in data.get("insights", [])
        ])

        fc = data.get("forecast_outlook", {})

        body = (
            f"Hello {current_user['username']},\n\n"
            f"Here is your AI Business Insights executive report for dataset '{dataset_id}'.\n\n"
            f"★ KEY TAKEAWAY:\n{data.get('key_takeaway', '')}\n\n"
            f"★ STRATEGIC INSIGHTS:\n{insights_text}\n\n"
            f"★ SHORT-TERM FORECAST (1–3 MONTHS):\n"
            f"Trend: {fc.get('trend_label', 'N/A')}\n"
            f"Expected Growth: {fc.get('expected_growth_str', 'N/A')}\n"
            f"Confidence: {fc.get('confidence_level', 'N/A')}\n"
            f"{fc.get('forecast_summary', '')}\n\n"
            f"Generated via BizVision AI Analytics Dashboard.\n"
        )

        # Generate CSV attachment
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Type", "Key Number", "Insight Text"])
        for item in data.get("insights", []):
            writer.writerow([item.get("type", ""), item.get("key_number", ""), item.get("text", "")])
        csv_bytes = output.getvalue().encode("utf-8")

        sent, msg = send_email(
            to_email=user_email,
            subject=f"BizVision AI Insights: {dataset_id}",
            body=body,
            attachment_bytes=csv_bytes,
            attachment_filename=f"ai_insights_{dataset_id}.csv"
        )

        if not sent:
            return {
                "success": True,
                "warning": msg,
                "message": f"Insights created, but email could not be sent: {msg}"
            }

        return {
            "success": True,
            "message": f"AI Insights successfully sent to {user_email}!"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch insights email: {str(e)}")


@router.post("/chat")
@router.post("/insights/chat")
def chat_with_ai(request: ChatQueryRequest, current_user: dict = Depends(get_current_user)):
    """Interactive natural language assistant for queries on active dataset."""
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
