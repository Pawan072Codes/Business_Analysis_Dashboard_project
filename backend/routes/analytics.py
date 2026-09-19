import io
import pandas as pd
from fastapi import APIRouter, HTTPException, Depends, Response, Query
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

from services.kpi_detector import detect_column_roles, generate_kpi_list
from services.eda import run_eda
from services.cleaning import clean_dataset
from services.email_service import send_email
from routes.auth import get_current_user

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()


def check_dataset_access(dataset_id: str, user_id: int):
    """
    Verifies that dataset belongs to current user if recorded in registry.
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT user_id FROM datasets WHERE dataset_id = :did"),
            {"did": dataset_id}
        ).fetchone()
        if row and row[0] != user_id:
            raise HTTPException(status_code=403, detail="Access denied: Dataset belongs to another user")


@router.get("/analytics/{dataset_id}")
def get_analytics(dataset_id: str, current_user: dict = Depends(get_current_user)):
    """
    Runs cleaning + EDA + KPI detection for a specific dataset_id and returns results as JSON.
    """
    check_dataset_access(dataset_id, current_user["id"])

    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    cleaning_result = clean_dataset(df)
    clean_df = cleaning_result["cleaned_df"]

    kpi_result = generate_kpi_list(clean_df)
    eda_result = run_eda(clean_df, table_name=dataset_id)

    return {
        "dataset_id": dataset_id,
        "cleaning_report": cleaning_result["report"],
        "kpis": kpi_result["kpis"],
        "detected_columns": kpi_result["detected_columns"],
        "summary_stats": eda_result["summary_stats"],
        "charts": eda_result["charts"]
    }


@router.get("/compare")
def compare_datasets(
    datasets: str = Query(..., description="Comma-separated dataset table names, e.g. 'table1,table2'"),
    group_by: str = Query("month", description="Time grouping: 'month' or 'day'"),
    current_user: dict = Depends(get_current_user)
):
    """
    Multi-Dataset Timeline Comparison API (Phase 2).
    Accepts two or more dataset names/IDs, detects date & metric columns for each,
    aggregates metrics per time period, performs Outer Union timeline alignment,
    and returns aligned series data ready for multi-dataset Chart.js plotting.
    """
    dataset_list = [d.strip() for d in datasets.split(",") if d.strip()]
    if len(dataset_list) < 1:
        raise HTTPException(status_code=400, detail="At least one dataset name must be provided for comparison.")

    # Verify access for all requested datasets
    for d_id in dataset_list:
        check_dataset_access(d_id, current_user["id"])

    dataset_series = {}
    dataset_kpis = {}

    for d_id in dataset_list:
        try:
            df = pd.read_sql(f'SELECT * FROM "{d_id}"', engine)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Dataset '{d_id}' not found: {e}")

        roles = detect_column_roles(df)
        
        # Determine target metric column (revenue/sales/numeric)
        val_col = roles["revenue_columns"][0] if roles["revenue_columns"] else None
        if not val_col:
            num_cols = df.select_dtypes(include="number").columns
            val_col = num_cols[0] if len(num_cols) > 0 else None

        # Determine date column
        date_col = roles["date_columns"][0] if roles["date_columns"] else None
        if not date_col:
            dt_cols = df.select_dtypes(include="datetime").columns
            date_col = dt_cols[0] if len(dt_cols) > 0 else None

        # Process timeline if date and value columns exist
        period_map = {}
        if date_col and val_col:
            df_temp = df[[date_col, val_col]].dropna().copy()
            df_temp[date_col] = pd.to_datetime(df_temp[date_col], errors="coerce")
            df_temp = df_temp.dropna(subset=[date_col])

            if group_by == "day":
                df_temp["period"] = df_temp[date_col].dt.strftime("%Y-%m-%d")
            else:
                df_temp["period"] = df_temp[date_col].dt.strftime("%Y-%m")

            grouped = df_temp.groupby("period")[val_col].sum()
            period_map = {str(k): float(round(v, 2)) for k, v in grouped.items()}

        # Compute summary KPIs
        total_val = float(round(df[val_col].sum(), 2)) if val_col and val_col in df.columns else 0.0
        rec_count = len(df)

        dataset_series[d_id] = period_map
        dataset_kpis[d_id] = {
            "dataset_id": d_id,
            "total_value": total_val,
            "record_count": rec_count,
            "metric_column": val_col or "N/A",
            "date_column": date_col or "N/A"
        }

    # Step: Outer Union Alignment of all periods across datasets
    all_periods = set()
    for period_map in dataset_series.values():
        all_periods.update(period_map.keys())

    sorted_labels = sorted(list(all_periods))

    # If no dates found, generate fallback labels
    if not sorted_labels:
        sorted_labels = ["Period 1", "Period 2", "Period 3", "Period 4", "Period 5"]

    # Align each dataset against the master sorted labels list
    aligned_datasets = []
    for d_id in dataset_list:
        period_map = dataset_series[d_id]
        if period_map:
            aligned_data = [period_map.get(period, 0.0) for period in sorted_labels]
        else:
            # Fallback uniform distribution if no date column exists
            total = dataset_kpis[d_id]["total_value"]
            aligned_data = [round(total / len(sorted_labels), 2)] * len(sorted_labels)

        aligned_datasets.append({
            "dataset_id": d_id,
            "data": aligned_data,
            "kpi_summary": dataset_kpis[d_id]
        })

    return {
        "labels": sorted_labels,
        "group_by": group_by,
        "datasets": aligned_datasets,
        "alignment_info": {
            "total_periods": len(sorted_labels),
            "period_range": [sorted_labels[0], sorted_labels[-1]] if sorted_labels else ["N/A", "N/A"]
        }
    }


def generate_report_content(dataset_id: str) -> tuple[str, str]:
    """
    Generates a structured CSV report containing KPI metrics + cleaned dataset data.

    TRADEOFF EXPLANATION (CSV vs PDF):
    CSV is lightweight, fast, and native for analytical workflows (Excel/Pandas/PowerBI),
    enabling immediate data manipulation by users. PDF offers superior visual design for
    printing/executive views, but introduces heavier server overhead and makes raw data
    difficult to re-use.
    """
    df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    cleaning_result = clean_dataset(df)
    clean_df = cleaning_result["cleaned_df"]
    kpi_result = generate_kpi_list(clean_df)

    buffer = io.StringIO()
    buffer.write(f"# BizVision Analytics Report - Dataset: {dataset_id}\n")
    buffer.write("# KEY PERFORMANCE INDICATORS\n")
    for k in kpi_result.get("kpis", []):
        if k.get("available", True):
            name = k.get("kpi") or k.get("name") or "KPI"
            val = k.get("value", "N/A")
            buffer.write(f"# {name}: {val}\n")
    buffer.write("#\n# CLEANED DATASET ROWS\n")


    clean_df.to_csv(buffer, index=False)
    content_str = buffer.getvalue()
    filename = f"report_{dataset_id}.csv"
    return content_str, filename


@router.get("/download/{dataset_id}")
def download_report(dataset_id: str, current_user: dict = Depends(get_current_user)):
    """
    Generates and returns downloadable analytics report CSV file for dataset.
    """
    check_dataset_access(dataset_id, current_user["id"])
    try:
        csv_content, filename = generate_report_content(dataset_id)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {e}")


@router.post("/send-report/{dataset_id}")
def send_report_email(dataset_id: str, current_user: dict = Depends(get_current_user)):
    """
    Manual button trigger: Emails the report file as an attachment to the logged-in user's email.
    """
    check_dataset_access(dataset_id, current_user["id"])
    try:
        csv_content, filename = generate_report_content(dataset_id)
        user_email = current_user["email"]

        body = (
            f"Hello {current_user['username']},\n\n"
            f"Please find attached your requested analytics report for dataset '{dataset_id}'.\n\n"
            f"Best regards,\nBizVision Analytics Team"
        )

        sent, msg = send_email(
            to_email=user_email,
            subject=f"BizVision Report: {dataset_id}",
            body=body,
            attachment_bytes=csv_content.encode("utf-8"),
            attachment_filename=filename
        )

        if not sent:
            return {
                "success": True,
                "warning": msg,
                "message": f"Report created, but email could not be sent: {msg}"
            }

        return {
            "success": True,
            "message": "Report sent to your email"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not send report email: {e}")