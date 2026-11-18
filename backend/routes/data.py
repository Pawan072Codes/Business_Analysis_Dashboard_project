import os
from datetime import datetime
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy import create_engine

from routes.auth import get_current_user
from routes.analytics import check_dataset_access

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()


def _json_safe(value):
    if value is None:
        return None
    if isinstance(value, np.ndarray):
        return value.tolist() if value.size > 0 else []
    if isinstance(value, pd.DataFrame):
        return value.to_dict(orient="records") if not value.empty else []
    if isinstance(value, pd.Series):
        return value.to_list() if not value.empty else []
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value] if len(value) > 0 else []
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, (float, np.floating)):
        if np.isnan(value) or np.isinf(value):
            return None
        return float(value)
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


@router.get("/data/{dataset_id}")
def get_data(
    dataset_id: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=1000),
    current_user: dict = Depends(get_current_user)
):
    check_dataset_access(dataset_id, current_user["id"])
    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    rows = [
        {column: _json_safe(value) for column, value in row.items()}
        for row in df.iloc[skip:skip + limit].to_dict(orient="records")
    ]
    return {"dataset_id": dataset_id, "data": rows, "total": len(df)}


@router.get("/data/{dataset_id}/search")
def search_dataset(
    dataset_id: str,
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=8, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    check_dataset_access(dataset_id, current_user["id"])
    query_str = q.strip().lower()
    if not query_str:
        return {"dataset_id": dataset_id, "query": q, "total_matches": 0, "results": []}

    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    results = []
    total_matches = 0

    # Dynamic vectorized & safe record scanning across all columns
    for idx, row in df.iterrows():
        row_dict = {column: _json_safe(value) for column, value in row.items()}
        row_num = idx + 1

        row_matched = False
        for col_name, val in row_dict.items():
            if val is None:
                continue
            str_val = str(val)
            if query_str in str_val.lower():
                total_matches += 1
                if len(results) < limit and not row_matched:
                    results.append({
                        "row_index": row_num,
                        "column": col_name,
                        "value": str_val,
                        "record": row_dict
                    })
                    row_matched = True

    return {
        "dataset_id": dataset_id,
        "query": q,
        "total_matches": total_matches,
        "results": results
    }
