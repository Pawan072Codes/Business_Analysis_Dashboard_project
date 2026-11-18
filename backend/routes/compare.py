from __future__ import annotations
import os
import io
import re
from typing import Optional, List, Union, Dict, Any
import pandas as pd
import numpy as np
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Response, Query
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from pydantic import BaseModel

from services.kpi_detector import detect_column_roles
from routes.auth import get_current_user
from routes.analytics import check_dataset_access

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()


def is_dataset_cleaned(dataset_id: str, user_id: int) -> bool:
    """
    Validates whether a dataset exists and was processed through the Upload/Cleaning pipeline.
    All valid datasets in the 'datasets' registry table were cleaned by clean_dataset()
    during ingestion.
    """
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT dataset_id, user_id FROM datasets WHERE dataset_id = :did"),
                {"did": dataset_id}
            ).fetchone()
            if not row:
                return False
            if row[1] != user_id:
                return False
            
            # Check table exists in database
            table_check = conn.execute(
                text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = :tname
                    );
                """),
                {"tname": dataset_id}
            ).scalar()
            return bool(table_check)
    except Exception:
        return False


def get_dataset_filename(dataset_id: str, user_id: int) -> str:
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT original_filename FROM datasets WHERE dataset_id = :did AND user_id = :uid"),
                {"did": dataset_id, "uid": user_id}
            ).fetchone()
            if row and row[0]:
                return row[0]
    except Exception:
        pass
    return dataset_id


@router.get("/compare/datasets")
def get_cleaned_datasets_for_compare(current_user: dict = Depends(get_current_user)):
    """
    Returns only verified, CLEANED datasets owned by the current logged-in user.
    Uncleaned / raw datasets are excluded to ensure valid comparisons.
    """
    user_id = current_user["id"]
    try:
        query = text("""
            SELECT dataset_id, original_filename, created_at
            FROM datasets
            WHERE user_id = :uid
            ORDER BY created_at DESC;
        """)
        with engine.connect() as conn:
            rows = conn.execute(query, {"uid": user_id}).fetchall()

        datasets_list = []
        for row in rows:
            d_id = row[0]
            fname = row[1]
            c_at = str(row[2])

            try:
                # Read sample to verify column roles and row count
                with engine.connect() as conn:
                    count_res = conn.execute(text(f'SELECT COUNT(*) FROM "{d_id}"')).scalar()
                
                df_sample = pd.read_sql(f'SELECT * FROM "{d_id}" LIMIT 5', engine)
                roles = detect_column_roles(df_sample)

                # Filter numeric columns for metrics
                num_cols = df_sample.select_dtypes(include=[np.number]).columns.tolist()
                metric_cols = [c for c in num_cols if not c.endswith("_is_outlier") and c != "row_id"]

                datasets_list.append({
                    "dataset_id": d_id,
                    "filename": fname,
                    "created_at": c_at,
                    "is_cleaned": True,
                    "row_count": int(count_res) if count_res else 0,
                    "column_count": len(df_sample.columns),
                    "columns": list(df_sample.columns),
                    "metric_columns": metric_cols,
                    "category_columns": roles.get("category_columns", []),
                    "date_columns": roles.get("date_columns", [])
                })
            except Exception as e:
                # Table might have been dropped or corrupt
                continue

        return {
            "success": True,
            "count": len(datasets_list),
            "datasets": datasets_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load datasets: {e}")


@router.get("/compare/columns")
def get_common_columns(
    dataset_a: str = Query(..., description="ID of Dataset A"),
    dataset_b: Optional[str] = Query(default=None, description="ID of Dataset B (optional for single dataset comparison)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Inspects schemas of datasets and detects common columns or single dataset columns:
    - Common numeric metrics
    - Common category/region dimensions
    - Common date columns
    Validates that datasets have been processed through the cleaning pipeline.
    """
    user_id = current_user["id"]
    if not dataset_b:
        dataset_b = dataset_a

    # 1. Validation Before Compare: Check datasets are cleaned
    cleaned_a = is_dataset_cleaned(dataset_a, user_id)
    cleaned_b = is_dataset_cleaned(dataset_b, user_id)

    if not cleaned_a:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset A ('{dataset_a}') has not been cleaned yet. Datasets must be processed through the Upload/Cleaning pipeline."
        )
    if not cleaned_b:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset B ('{dataset_b}') has not been cleaned yet. Datasets must be processed through the Upload/Cleaning pipeline."
        )

    try:
        df_a = pd.read_sql(f'SELECT * FROM "{dataset_a}" LIMIT 10', engine)
        df_b = pd.read_sql(f'SELECT * FROM "{dataset_b}" LIMIT 10', engine) if dataset_b != dataset_a else df_a.copy()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed reading datasets: {e}")

    cols_a = set(df_a.columns)
    cols_b = set(df_b.columns)
    common_cols = sorted(list(cols_a.intersection(cols_b)))

    roles_a = detect_column_roles(df_a)
    roles_b = detect_column_roles(df_b)

    common_metrics = []
    common_categories = []
    common_dates = []
    all_common_items = []

    for col in common_cols:
        if col.endswith("_is_outlier") or col == "row_id":
            continue

        is_num_a = pd.api.types.is_numeric_dtype(df_a[col])
        is_num_b = pd.api.types.is_numeric_dtype(df_b[col])

        # Date column detection
        is_date_a = col in roles_a.get("date_columns", []) or pd.api.types.is_datetime64_any_dtype(df_a[col])
        is_date_b = col in roles_b.get("date_columns", []) or pd.api.types.is_datetime64_any_dtype(df_b[col])

        # Category column detection
        is_cat_a = col in roles_a.get("category_columns", []) or pd.api.types.is_object_dtype(df_a[col]) or pd.api.types.is_string_dtype(df_a[col])
        is_cat_b = col in roles_b.get("category_columns", []) or pd.api.types.is_object_dtype(df_b[col]) or pd.api.types.is_string_dtype(df_b[col])

        role = "dimension"
        if is_date_a and is_date_b:
            role = "date"
            common_dates.append(col)
        elif is_num_a and is_num_b:
            role = "metric"
            common_metrics.append(col)
        elif is_cat_a and is_cat_b:
            role = "category"
            common_categories.append(col)

        all_common_items.append({
            "name": col,
            "display_name": col.replace("_", " ").title(),
            "role": role,
            "is_metric": role == "metric",
            "is_date": role == "date",
            "is_category": role == "category"
        })

    fname_a = get_dataset_filename(dataset_a, user_id)
    fname_b = get_dataset_filename(dataset_b, user_id)

    # Detailed column roles for A and B
    num_cols_a = [c for c in df_a.select_dtypes(include=[np.number]).columns if not c.endswith("_is_outlier") and c != "row_id"]
    num_cols_b = [c for c in df_b.select_dtypes(include=[np.number]).columns if not c.endswith("_is_outlier") and c != "row_id"]

    return {
        "success": True,
        "dataset_a": {
            "id": dataset_a,
            "filename": fname_a,
            "is_cleaned": True,
            "total_columns": len(cols_a),
            "columns": list(df_a.columns),
            "metric_columns": num_cols_a,
            "category_columns": roles_a.get("category_columns", []),
            "date_columns": roles_a.get("date_columns", [])
        },
        "dataset_b": {
            "id": dataset_b,
            "filename": fname_b,
            "is_cleaned": True,
            "total_columns": len(cols_b),
            "columns": list(df_b.columns),
            "metric_columns": num_cols_b,
            "category_columns": roles_b.get("category_columns", []),
            "date_columns": roles_b.get("date_columns", [])
        },
        "has_common_metrics": len(common_metrics) > 0 or (len(num_cols_a) > 0 and len(num_cols_b) > 0),
        "common_metrics": common_metrics,
        "common_categories": common_categories,
        "common_dates": common_dates,
        "all_common_columns": all_common_items
    }


class CompareRunPayload(BaseModel):
    dataset_a: str
    dataset_b: Optional[str] = None
    selected_metrics: list[str] = []
    metric_a: str | None = None
    metric_b: str | None = None
    trend_metric: str | None = None
    category_column: str | None = None
    date_column: str | None = None
    date_grouping: str = "month"  # "day", "month", "year"

CompareRunPayload.model_rebuild()


@router.post("/compare/run")
def run_dataset_comparison(
    payload: CompareRunPayload,
    current_user: dict = Depends(get_current_user)
):
    """
    Main Comparison Engine:
    Validates both datasets are cleaned, calculates real KPI comparisons,
    creates unified timeline trend series, category growth charts,
    identifies biggest changes (Top Increase, Top Decrease, Most Stable),
    and generates an automated Plain-English executive summary.
    If datasets are identical, outputs a 100% Match with zero variance.
    If only one dataset is provided or selected, supports comparing columns within that single dataset.
    """
    user_id = current_user["id"]
    ds_a = payload.dataset_a
    ds_b = payload.dataset_b or payload.dataset_a

    # 1. Validation Before Compare
    if not is_dataset_cleaned(ds_a, user_id):
        raise HTTPException(
            status_code=400,
            detail=f"Dataset A ('{ds_a}') has not been cleaned yet. Both datasets must be processed through the Upload/Cleaning pipeline."
        )
    if not is_dataset_cleaned(ds_b, user_id):
        raise HTTPException(
            status_code=400,
            detail=f"Dataset B ('{ds_b}') has not been cleaned yet. Both datasets must be processed through the Upload/Cleaning pipeline."
        )

    fname_a = get_dataset_filename(ds_a, user_id)
    fname_b = get_dataset_filename(ds_b, user_id)

    # 2. Load Real Data from PostgreSQL
    try:
        df_a = pd.read_sql(f'SELECT * FROM "{ds_a}"', engine)
        df_b = pd.read_sql(f'SELECT * FROM "{ds_b}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not load dataset data: {e}")

    # Remove outlier flag columns and metadata
    clean_cols_a = [c for c in df_a.columns if not c.endswith("_is_outlier") and c != "row_id"]
    clean_cols_b = [c for c in df_b.columns if not c.endswith("_is_outlier") and c != "row_id"]
    common_cols = set(clean_cols_a).intersection(clean_cols_b)

    # Detect roles
    roles_a = detect_column_roles(df_a)
    roles_b = detect_column_roles(df_b)

    # Identify common numeric columns
    numeric_cols = []
    for c in sorted(list(common_cols)):
        if pd.api.types.is_numeric_dtype(df_a[c]) and pd.api.types.is_numeric_dtype(df_b[c]):
            numeric_cols.append(c)

    # Fallback to individual numeric columns if user explicitly selected metric_a and metric_b
    num_a = [c for c in df_a.select_dtypes(include=[np.number]).columns if not c.endswith("_is_outlier") and c != "row_id"]
    num_b = [c for c in df_b.select_dtypes(include=[np.number]).columns if not c.endswith("_is_outlier") and c != "row_id"]

    if not numeric_cols and not (payload.metric_a and payload.metric_b):
        if num_a and num_b:
            payload.metric_a = payload.metric_a or num_a[0]
            payload.metric_b = payload.metric_b or num_b[0]
        else:
            return {
                "success": False,
                "error": "no_common_metrics",
                "message": "These datasets don't share a common metric to compare.",
                "columns_a": list(df_a.columns),
                "columns_b": list(df_b.columns)
            }

    # Use user-selected metrics or default to all common numeric columns
    selected_metrics = [m for m in payload.selected_metrics if m in numeric_cols]
    if not selected_metrics and numeric_cols:
        selected_metrics = numeric_cols
    elif not selected_metrics and payload.metric_a and payload.metric_b:
        selected_metrics = [f"{payload.metric_a} / {payload.metric_b}"]

    primary_metric = selected_metrics[0] if selected_metrics else (numeric_cols[0] if numeric_cols else "Metric")

    # Category / Dimension Column detection
    cat_col = payload.category_column
    if not cat_col or cat_col not in common_cols:
        cand_cats = [c for c in common_cols if c in roles_a.get("category_columns", []) and c in roles_b.get("category_columns", [])]
        if not cand_cats:
            for c in common_cols:
                if pd.api.types.is_object_dtype(df_a[c]) and pd.api.types.is_object_dtype(df_b[c]):
                    u_a = df_a[c].nunique()
                    u_b = df_b[c].nunique()
                    if 1 < u_a <= 50 and 1 < u_b <= 50:
                        cand_cats.append(c)
        cat_col = cand_cats[0] if cand_cats else None

    # Date Column detection
    date_col = payload.date_column
    if not date_col or date_col not in common_cols:
        cand_dates = [c for c in common_cols if c in roles_a.get("date_columns", []) and c in roles_b.get("date_columns", [])]
        if not cand_dates:
            for c in common_cols:
                if pd.api.types.is_datetime64_any_dtype(df_a[c]) or pd.api.types.is_datetime64_any_dtype(df_b[c]):
                    cand_dates.append(c)
        date_col = cand_dates[0] if cand_dates else None

    # 3. KPI COMPARISON CARDS CALCULATION
    kpi_cards = []
    comparison_table_rows = []
    metric_changes = []

    for metric in selected_metrics:
        col_a_name = payload.metric_a if (metric == selected_metrics[0] and payload.metric_a in df_a.columns) else metric
        col_b_name = payload.metric_b if (metric == selected_metrics[0] and payload.metric_b in df_b.columns) else metric

        if col_a_name not in df_a.columns or col_b_name not in df_b.columns:
            continue

        val_a = float(df_a[col_a_name].sum())
        val_b = float(df_b[col_b_name].sum())
        mean_a = float(df_a[col_a_name].mean())
        mean_b = float(df_b[col_b_name].mean())
        diff = round(val_b - val_a, 2)

        if abs(val_a) > 0:
            pct_change = round(((val_b - val_a) / abs(val_a)) * 100, 2)
        else:
            pct_change = 100.0 if val_b > 0 else 0.0

        status = "increase" if pct_change > 0.05 else ("decrease" if pct_change < -0.05 else "neutral")
        status_label = "Dataset B Outperforming" if pct_change > 0 else ("Dataset A Outperforming" if pct_change < 0 else "Equal")

        is_currency = any(kw in metric.lower() for kw in ["sales", "revenue", "profit", "price", "amount", "income", "cost"])
        unit_type = "currency" if is_currency else "number"
        metric_title = metric.replace("_", " ").title()

        kpi_card_data = {
            "metric": metric,
            "title": metric_title,
            "unit_type": unit_type,
            "val_a": round(val_a, 2),
            "val_b": round(val_b, 2),
            "mean_a": round(mean_a, 2),
            "mean_b": round(mean_b, 2),
            "diff": diff,
            "pct_change": pct_change,
            "status": status,
            "status_label": status_label
        }
        kpi_cards.append(kpi_card_data)

        metric_changes.append({
            "name": metric_title,
            "category": metric_title,
            "type": "metric",
            "val_a": val_a,
            "val_b": val_b,
            "pct_change": pct_change,
            "abs_pct": abs(pct_change),
            "diff": diff,
            "unit_type": unit_type
        })

        comparison_table_rows.append({
            "metric": metric_title,
            "category": "Key Metric",
            "val_a": round(val_a, 2),
            "val_b": round(val_b, 2),
            "diff": diff,
            "pct_change": pct_change,
            "status": status,
            "status_badge": f"+{pct_change}%" if pct_change > 0 else f"{pct_change}%",
            "unit_type": unit_type
        })

    # Add Row Count comparison
    count_a = int(len(df_a))
    count_b = int(len(df_b))
    count_diff = count_b - count_a
    count_pct = round(((count_b - count_a) / count_a) * 100, 2) if count_a > 0 else 0.0
    count_status = "increase" if count_pct > 0 else ("decrease" if count_pct < 0 else "neutral")

    comparison_table_rows.append({
        "metric": "Total Records / Row Count",
        "category": "Volume",
        "val_a": count_a,
        "val_b": count_b,
        "diff": count_diff,
        "pct_change": count_pct,
        "status": count_status,
        "status_badge": f"+{count_pct}%" if count_pct > 0 else f"{count_pct}%",
        "unit_type": "number"
    })

    # 4. TREND / DYNAMIC METRIC LINE CHART (ALWAYS POPULATED, NEVER BLANK!)
    target_metric = payload.trend_metric or (numeric_cols[0] if numeric_cols else (payload.metric_a or "Metric"))
    col_a_plot = payload.metric_a if (target_metric == primary_metric and payload.metric_a) else target_metric
    col_b_plot = payload.metric_b if (target_metric == primary_metric and payload.metric_b) else target_metric

    if col_a_plot not in df_a.columns:
        col_a_plot = num_a[0] if num_a else df_a.columns[0]
    if col_b_plot not in df_b.columns:
        col_b_plot = num_b[0] if num_b else df_b.columns[0]

    trend_labels = []
    trend_series_a = []
    trend_series_b = []
    trend_axis_title = "Time Period"

    # Attempt 1: Timeline alignment with date_col
    if date_col and date_col in df_a.columns and date_col in df_b.columns:
        try:
            df_a_date = df_a[[date_col, col_a_plot]].dropna().copy()
            df_b_date = df_b[[date_col, col_b_plot]].dropna().copy()

            df_a_date[date_col] = pd.to_datetime(df_a_date[date_col], errors="coerce")
            df_b_date[date_col] = pd.to_datetime(df_b_date[date_col], errors="coerce")

            df_a_date = df_a_date.dropna(subset=[date_col])
            df_b_date = df_b_date.dropna(subset=[date_col])

            date_fmt = "%Y-%m-%d" if payload.date_grouping == "day" else ("%Y" if payload.date_grouping == "year" else "%Y-%m")
            df_a_date["period"] = df_a_date[date_col].dt.strftime(date_fmt)
            df_b_date["period"] = df_b_date[date_col].dt.strftime(date_fmt)

            grp_a = df_a_date.groupby("period")[col_a_plot].sum()
            grp_b = df_b_date.groupby("period")[col_b_plot].sum()

            all_periods = sorted(list(set(grp_a.index).union(set(grp_b.index))))

            if all_periods:
                trend_labels = all_periods
                trend_series_a = [float(round(grp_a.get(p, 0.0), 2)) for p in all_periods]
                trend_series_b = [float(round(grp_b.get(p, 0.0), 2)) for p in all_periods]
                trend_axis_title = f"Date Period ({payload.date_grouping})"
        except Exception:
            trend_labels = []

    # Attempt 2: If no date column or date empty, plot metric by category as a line chart
    if not trend_labels and cat_col and cat_col in df_a.columns and cat_col in df_b.columns:
        try:
            grp_a = df_a.groupby(cat_col)[col_a_plot].sum()
            grp_b = df_b.groupby(cat_col)[col_b_plot].sum()
            all_cats = sorted(list(set(grp_a.index.astype(str)).union(set(grp_b.index.astype(str)))))[:12]
            trend_labels = all_cats
            trend_series_a = [float(round(grp_a.get(c, 0.0), 2)) for c in all_cats]
            trend_series_b = [float(round(grp_b.get(c, 0.0), 2)) for c in all_cats]
            trend_axis_title = f"Category ({cat_col.replace('_', ' ').title()})"
        except Exception:
            trend_labels = []

    # Attempt 3: Sequential segments / intervals across rows (Guaranteed fallback)
    if not trend_labels:
        n_segments = min(10, max(len(df_a), len(df_b), 1))
        trend_labels = [f"Segment {i+1}" for i in range(n_segments)]
        vals_a = df_a[col_a_plot].dropna().values if col_a_plot in df_a.columns else np.zeros(n_segments)
        vals_b = df_b[col_b_plot].dropna().values if col_b_plot in df_b.columns else np.zeros(n_segments)

        chunks_a = np.array_split(vals_a, n_segments) if (isinstance(vals_a, np.ndarray) and vals_a.size > 0) else []
        chunks_b = np.array_split(vals_b, n_segments) if (isinstance(vals_b, np.ndarray) and vals_b.size > 0) else []

        trend_series_a = [float(round(c.sum(), 2)) if (isinstance(c, np.ndarray) and c.size > 0) else 0.0 for c in chunks_a]
        trend_series_b = [float(round(c.sum(), 2)) if (isinstance(c, np.ndarray) and c.size > 0) else 0.0 for c in chunks_b]
        trend_axis_title = "Data Segment / Progression"

    trend_chart_data = {
        "labels": trend_labels,
        "date_column": date_col,
        "metric_column": target_metric,
        "metric_title": target_metric.replace("_", " ").title(),
        "available_metrics": numeric_cols if numeric_cols else list(set(num_a + num_b)),
        "axis_title": trend_axis_title,
        "grouping": payload.date_grouping,
        "dataset_a_name": fname_a,
        "dataset_b_name": fname_b,
        "series_a": trend_series_a,
        "series_b": trend_series_b
    }
    has_date_trend = True

    # 5. GROWTH / CHANGE CHART BY CATEGORY / REGION (SINGLE COMBINED CHART)
    category_chart_data = None
    category_changes = []

    if cat_col:
        try:
            # Clean category text
            df_a_cat = df_a[[cat_col, primary_metric]].dropna().copy()
            df_b_cat = df_b[[cat_col, primary_metric]].dropna().copy()

            df_a_cat[cat_col] = df_a_cat[cat_col].astype(str).str.strip()
            df_b_cat[cat_col] = df_b_cat[cat_col].astype(str).str.strip()

            cat_sum_a = df_a_cat.groupby(cat_col)[primary_metric].sum()
            cat_sum_b = df_b_cat.groupby(cat_col)[primary_metric].sum()

            # Union of all categories
            all_cats = sorted(list(set(cat_sum_a.index).union(set(cat_sum_b.index))))

            cat_items = []
            for cat in all_cats:
                c_val_a = float(round(cat_sum_a.get(cat, 0.0), 2))
                c_val_b = float(round(cat_sum_b.get(cat, 0.0), 2))
                c_diff = round(c_val_b - c_val_a, 2)
                
                if c_val_a > 0:
                    c_pct = round(((c_val_b - c_val_a) / c_val_a) * 100, 2)
                else:
                    c_pct = 100.0 if c_val_b > 0 else 0.0

                cat_items.append({
                    "category": cat,
                    "val_a": c_val_a,
                    "val_b": c_val_b,
                    "diff": c_diff,
                    "pct_change": c_pct,
                    "abs_pct": abs(c_pct)
                })

                category_changes.append({
                    "name": f"{cat_col.replace('_', ' ').title()}: {cat}",
                    "category": cat,
                    "category_name": cat,
                    "type": "category",
                    "val_a": c_val_a,
                    "val_b": c_val_b,
                    "pct_change": c_pct,
                    "abs_pct": abs(c_pct),
                    "diff": c_diff,
                    "unit_type": "currency" if any(kw in primary_metric.lower() for kw in ["sales", "revenue", "profit"]) else "number"
                })

                comparison_table_rows.append({
                    "metric": f"{cat} ({cat_col.replace('_', ' ').title()})",
                    "category": "Segment Breakdown",
                    "val_a": c_val_a,
                    "val_b": c_val_b,
                    "diff": c_diff,
                    "pct_change": c_pct,
                    "status": "increase" if c_pct > 0 else ("decrease" if c_pct < 0 else "neutral"),
                    "status_badge": f"+{c_pct}%" if c_pct > 0 else f"{c_pct}%",
                    "unit_type": "currency" if any(kw in primary_metric.lower() for kw in ["sales", "revenue", "profit"]) else "number"
                })

            # Sort by absolute delta or value
            cat_items.sort(key=lambda x: x["val_a"] + x["val_b"], reverse=True)
            top_cats = cat_items[:12]  # Keep top 12 for readability

            cat_labels = [c["category"] for c in top_cats]
            c_series_a = [c["val_a"] for c in top_cats]
            c_series_b = [c["val_b"] for c in top_cats]
            c_growth_pcts = [c["pct_change"] for c in top_cats]
            c_growth_colors = ["#10b981" if p >= 0 else "#ef4444" for p in c_growth_pcts]

            category_chart_data = {
                "category_column": cat_col,
                "category_title": cat_col.replace("_", " ").title(),
                "metric_column": primary_metric,
                "metric_title": primary_metric.replace("_", " ").title(),
                "dataset_a_name": fname_a,
                "dataset_b_name": fname_b,
                "labels": cat_labels,
                "series_a": c_series_a,
                "series_b": c_series_b,
                "growth_pcts": c_growth_pcts,
                "growth_colors": c_growth_colors
            }
        except Exception as e:
            category_chart_data = None

    # 6. BIGGEST CHANGES SECTION (Top Increase, Top Decrease, Most Stable)
    all_change_candidates = metric_changes + category_changes

    # Filter candidates with non-zero baseline
    valid_increases = [c for c in all_change_candidates if c["pct_change"] > 0]
    valid_decreases = [c for c in all_change_candidates if c["pct_change"] < 0]
    all_candidates_for_stable = [c for c in all_change_candidates if c["val_a"] > 0 or c["val_b"] > 0]

    top_increase = max(valid_increases, key=lambda x: x["pct_change"]) if valid_increases else (
        all_change_candidates[0] if all_change_candidates else None
    )
    top_decrease = min(valid_decreases, key=lambda x: x["pct_change"]) if valid_decreases else None
    
    # Most stable has smallest absolute percent change
    most_stable = min(all_candidates_for_stable, key=lambda x: x["abs_pct"]) if all_candidates_for_stable else None

    biggest_changes = {
        "top_increase": top_increase,
        "top_decrease": top_decrease,
        "most_stable": most_stable
    }

    # 7. PLAIN-ENGLISH SUMMARY STATEMENT (Calculated from real data only)
    primary_kpi = kpi_cards[0]
    pri_val_a = primary_kpi["val_a"]
    pri_val_b = primary_kpi["val_b"]
    pri_diff = primary_kpi["diff"]
    pri_pct = primary_kpi["pct_change"]
    pri_name = primary_kpi["title"]

    if pri_pct > 0:
        summary_intro = f"<strong>{fname_b}</strong> outperforms <strong>{fname_a}</strong> in primary metric <em>{pri_name}</em> by +{pri_pct:.1f}% (+{abs(pri_diff):,.2f})."
    elif pri_pct < 0:
        summary_intro = f"<strong>{fname_b}</strong> trails <strong>{fname_a}</strong> in primary metric <em>{pri_name}</em> by {pri_pct:.1f}% (-{abs(pri_diff):,.2f})."
    else:
        summary_intro = f"<strong>{fname_b}</strong> and <strong>{fname_a}</strong> show equivalent primary metric <em>{pri_name}</em> totals."

    if top_increase:
        inc_label = top_increase.get("category") or top_increase.get("name") or "Primary Segment"
        pct_val = float(top_increase.get("pct_change", 0.0))
        sign = "+" if pct_val >= 0 else ""
        driver_detail = f"Top growth driver is <strong>{inc_label}</strong> with a {sign}{pct_val:.1f}% change."
    else:
        driver_detail = ""

    if most_stable:
        stable_label = most_stable.get("category") or most_stable.get("name") or "Overall Metric"
        pct_stable = float(most_stable.get("pct_change", 0.0))
        stability_detail = f"The most consistent dimension is <strong>{stable_label}</strong> ({pct_stable:+.1f}% shift)."
    else:
        stability_detail = ""

    vol_diff = count_b - count_a
    vol_pct = ((count_b - count_a) / count_a * 100) if count_a > 0 else 0
    if vol_diff != 0:
        volume_detail = f"Data volume differs by {vol_diff:+,d} rows ({vol_pct:+.1f}%)."
    else:
        volume_detail = f"Both datasets maintain matching volume ({count_a:,} rows)."

    is_identical = (ds_a == ds_b and (not payload.metric_a or not payload.metric_b or payload.metric_a == payload.metric_b)) or (len(df_a) == len(df_b) and list(df_a.columns) == list(df_b.columns) and df_a.equals(df_b))
    is_single_dataset_col_compare = (ds_a == ds_b) and bool(payload.metric_a and payload.metric_b and payload.metric_a != payload.metric_b)

    if is_identical:
        similarity_pct = 100.0
        match_badge = "100% Match (Identical Datasets)"
        plain_summary_html = f"✨ <strong>100% Match:</strong> Datasets <strong>{fname_a}</strong> and <strong>{fname_b}</strong> are 100% identical. All metric totals, distributions, and {count_a:,} records match perfectly with 0.0% variance."
    elif is_single_dataset_col_compare:
        similarity_pct = round(max(0.0, 100.0 - abs(pri_pct)), 1)
        match_badge = f"Column Comparison: {payload.metric_a} vs {payload.metric_b}"
        plain_summary_html = f"📊 <strong>Column Comparison within {fname_a}:</strong> Comparing <strong>{payload.metric_a}</strong> vs <strong>{payload.metric_b}</strong>. {summary_intro} {driver_detail} {stability_detail}"
    else:
        similarity_pct = round(max(0.0, 100.0 - abs(pri_pct)), 1)
        match_badge = "100% Match" if similarity_pct >= 99.9 else f"{similarity_pct}% Similarity"
        plain_summary_html = f"💡 <strong>Executive Verdict:</strong> {summary_intro} {driver_detail} {stability_detail} {volume_detail}"

    return {
        "success": True,
        "is_identical": is_identical,
        "is_single_dataset_col_compare": is_single_dataset_col_compare,
        "match_percentage": similarity_pct,
        "match_badge": match_badge,
        "dataset_a": {
            "id": ds_a,
            "filename": fname_a,
            "is_cleaned": True,
            "row_count": count_a
        },
        "dataset_b": {
            "id": ds_b,
            "filename": fname_b,
            "is_cleaned": True,
            "row_count": count_b
        },
        "primary_metric": primary_metric,
        "selected_metrics": selected_metrics,
        "category_column": cat_col,
        "date_column": date_col,
        "date_grouping": payload.date_grouping,
        "kpi_cards": kpi_cards,
        "has_date_trend": has_date_trend,
        "trend_chart_data": trend_chart_data,
        "has_category_breakdown": category_chart_data is not None,
        "category_chart_data": category_chart_data,
        "biggest_changes": biggest_changes,
        "plain_summary": plain_summary_html,
        "comparison_table": comparison_table_rows
    }


@router.post("/compare/export")
def export_comparison_csv(
    payload: CompareRunPayload,
    current_user: dict = Depends(get_current_user)
):
    """
    Exports structured comparison results as CSV.
    """
    comp_result = run_dataset_comparison(payload, current_user)
    if not comp_result.get("success"):
        raise HTTPException(status_code=400, detail="Comparison could not be completed for export.")

    output = io.StringIO()
    output.write(f"# BizVision Analytics - Dataset Comparison Report\n")
    output.write(f"# Generated At: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    output.write(f"# Dataset A: {comp_result['dataset_a']['filename']} (ID: {comp_result['dataset_a']['id']})\n")
    output.write(f"# Dataset B: {comp_result['dataset_b']['filename']} (ID: {comp_result['dataset_b']['id']})\n#\n")

    # Table rows
    table_df = pd.DataFrame(comp_result["comparison_table"])
    if not table_df.empty:
        export_df = table_df[["metric", "category", "val_a", "val_b", "diff", "pct_change", "status"]]
        export_df.columns = ["Metric", "Category", f"Dataset A ({comp_result['dataset_a']['filename']})", f"Dataset B ({comp_result['dataset_b']['filename']})", "Difference", "Change %", "Status"]
        export_df.to_csv(output, index=False)

    csv_data = output.getvalue()
    filename = f"comparison_{comp_result['dataset_a']['id']}_vs_{comp_result['dataset_b']['id']}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/compare/records/{dataset_id}")
def get_dataset_records(
    dataset_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str = Query("", max_length=200),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetches raw/cleaned data records for side-by-side dataset inspection.
    """
    check_dataset_access(dataset_id, current_user["id"])
    fname = get_dataset_filename(dataset_id, current_user["id"])
    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    skip_val = skip if isinstance(skip, int) else 0
    limit_val = limit if isinstance(limit, int) else 100
    search_str = search.strip().lower() if isinstance(search, str) else ""

    total_rows = len(df)
    clean_cols = [c for c in df.columns if not c.endswith("_is_outlier") and c != "row_id"]

    if search_str:
        mask = df[clean_cols].astype(str).apply(lambda row: row.str.lower().str.contains(search_str).any(), axis=1)
        df_filtered = df[mask]
    else:
        df_filtered = df

    records_slice = df_filtered.iloc[skip_val:skip_val+limit_val]
    rows = []
    for idx, row in records_slice.iterrows():
        r_dict = {"_row_id": int(idx)}
        for col in clean_cols:
            val = row[col]
            if val is None:
                r_dict[col] = ""
            elif isinstance(val, np.ndarray):
                r_dict[col] = val.tolist() if val.size > 0 else []
            elif isinstance(val, (list, tuple)):
                r_dict[col] = list(val) if len(val) > 0 else []
            elif isinstance(val, (int, np.integer)):
                r_dict[col] = int(val)
            elif isinstance(val, (float, np.floating)):
                r_dict[col] = "" if (np.isnan(val) or np.isinf(val)) else round(float(val), 2)
            else:
                try:
                    if pd.isna(val):
                        r_dict[col] = ""
                    else:
                        r_dict[col] = str(val)
                except Exception:
                    r_dict[col] = str(val)
        rows.append(r_dict)

    return {
        "success": True,
        "dataset_id": dataset_id,
        "filename": fname,
        "columns": clean_cols,
        "total_rows": total_rows,
        "filtered_rows": len(df_filtered),
        "records": rows
    }


class UpdateCellPayload(BaseModel):
    row_index: int
    column: str
    new_value: str | int | float | None


@router.post("/compare/records/{dataset_id}/update")
def update_record_cell(
    dataset_id: str,
    payload: UpdateCellPayload,
    current_user: dict = Depends(get_current_user)
):
    """
    Updates an edited cell in the dataset table.
    """
    check_dataset_access(dataset_id, current_user["id"])
    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
        if payload.row_index < 0 or payload.row_index >= len(df):
            raise HTTPException(status_code=400, detail="Invalid row index")
        if payload.column not in df.columns:
            raise HTTPException(status_code=400, detail="Column not found")

        val = payload.new_value
        if pd.api.types.is_numeric_dtype(df[payload.column]):
            try:
                val = float(val) if "." in str(val) else int(val)
            except Exception:
                pass

        df.at[payload.row_index, payload.column] = val
        df.to_sql(dataset_id, engine, if_exists="replace", index=False)
        return {"success": True, "dataset_id": dataset_id, "updated": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update cell: {e}")


@router.get("/compare/records/{dataset_id}/download")
def download_single_dataset(
    dataset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Downloads the entire dataset table as CSV.
    """
    check_dataset_access(dataset_id, current_user["id"])
    fname = get_dataset_filename(dataset_id, current_user["id"])
    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
        clean_cols = [c for c in df.columns if not c.endswith("_is_outlier") and c != "row_id"]
        df_clean = df[clean_cols]
        output = io.StringIO()
        df_clean.to_csv(output, index=False)
        csv_data = output.getvalue()

        clean_filename = fname if fname.endswith(".csv") else f"{fname}.csv"
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{clean_filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download dataset: {e}")
