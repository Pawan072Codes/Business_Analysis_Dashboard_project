import re
import os
import traceback
from datetime import datetime
from uuid import uuid4
import numpy as np
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy import create_engine, text
from pydantic import BaseModel
from dotenv import load_dotenv

from services.cleaning import clean_dataset
from services.kpi_detector import detect_column_roles, generate_kpi_list
from services.email_service import send_email
from routes.auth import get_current_user

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

def sanitize_json_obj(obj):
    """
    Recursively sanitize objects (handling NaN, inf, NaT, Timestamp, numpy types, arrays, dataframes)
    so they serialize flawlessly into JSON without triggering truth-value ambiguity errors.
    Explicitly checks array.size > 0, not df.empty, and len(list) > 0.
    """
    if obj is None:
        return None
    if isinstance(obj, np.ndarray):
        return [sanitize_json_obj(v) for v in obj.tolist()] if obj.size > 0 else []
    if isinstance(obj, pd.DataFrame):
        return [sanitize_json_obj(r) for r in obj.to_dict(orient="records")] if not obj.empty else []
    if isinstance(obj, pd.Series):
        return [sanitize_json_obj(v) for v in obj.to_list()] if not obj.empty else []
    if isinstance(obj, (list, tuple, set)):
        return [sanitize_json_obj(v) for v in obj] if len(obj) > 0 else []
    if isinstance(obj, dict):
        return {str(k): sanitize_json_obj(v) for k, v in obj.items()} if len(obj) > 0 else {}
    if isinstance(obj, (datetime, pd.Timestamp)):
        return obj.isoformat()
    if isinstance(obj, (float, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    try:
        if pd.isna(obj):
            return None
    except Exception:
        pass
    return str(obj)

# clean column names — remove spaces, special chars, lowercase everything, cap length for PostgreSQL identifier limit (63 chars)
def clean_column_name(name: str, max_len: int = 48) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9_]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "col"
    if name[0].isdigit():
        name = "col_" + name
    if len(name) > max_len:
        name = name[:max_len].rstrip("_")
    return name or "col"

def make_unique_column_names(columns, max_len=52):
    seen = {}
    unique = []
    for col in columns:
        col_str = str(col)
        if col_str.endswith("_is_outlier"):
            base = clean_column_name(col_str[:-11], max_len=45)
            c = f"{base}_is_outlier"
        else:
            c = clean_column_name(col_str, max_len=max_len)

        if c in seen:
            seen[c] += 1
            suffix = f"_{seen[c]}"
            c = f"{c[: 60 - len(suffix)]}{suffix}"
        else:
            seen[c] = 0
        unique.append(c)
    return unique

def ingest_dataframe_as_dataset(raw_df: pd.DataFrame, filename: str, current_user: dict):
    try:
        if raw_df is None or (isinstance(raw_df, pd.DataFrame) and raw_df.empty) or len(raw_df) == 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty or contains zero rows of data. Please upload a valid CSV or Excel spreadsheet."
            )

        # Sanitize and deduplicate column names on raw dataframe upfront
        raw_df.columns = make_unique_column_names(raw_df.columns)

        raw_rows_count = len(raw_df)
        raw_preview_records = raw_df.head(50).to_dict(orient="records")

        # Clean the data — handle missing values, duplicates, dtypes, outliers
        result = clean_dataset(raw_df.copy())
        cleaned_df = result["cleaned_df"]
        # Ensure cleaned_df column names are also sanitized and unique
        cleaned_df.columns = make_unique_column_names(cleaned_df.columns)
        cleaning_report = result["report"]
        duplicates_count = cleaning_report.get("duplicates_removed", 0)

        # Generate a unique table name — original filename + timestamp + random suffix
        # PostgreSQL identifier limit is 63 bytes (NAMEDATALEN - 1)
        base_name = re.sub(r"[^a-z0-9_]", "_", os.path.splitext(filename)[0].lower()).strip("_")
        base_name = re.sub(r"_+", "_", base_name)
        base_name = base_name or "dataset"
        # Suffix length is 1 + 15 + 1 + 8 = 25 chars. Keep base_name to <= 30 chars so total length <= 56 chars.
        base_name = base_name[:30].rstrip("_")
        base_name = base_name or "dataset"

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_suffix = uuid4().hex[:8]
        table_name = f"{base_name}_{timestamp}_{unique_suffix}"
        if len(table_name) > 63:
            table_name = table_name[:63].rstrip("_")

        user_id = current_user["id"]

        # Ingest data into PostgreSQL table and register in datasets table
        try:
            # 1. Clean up any existing table with this exact name
            with engine.connect() as conn:
                conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE;'))
                conn.commit()

            # 2. Write DataFrame to PostgreSQL table using SQLAlchemy engine
            cleaned_df.to_sql(table_name, engine, if_exists="replace", index=False, chunksize=2000)

            # 3. Register dataset under current user
            with engine.connect() as conn:
                conn.execute(
                    text("""
                        INSERT INTO datasets (dataset_id, original_filename, user_id)
                        VALUES (:did, :fname, :uid)
                    """),
                    {"did": table_name, "fname": filename, "uid": user_id}
                )
                conn.commit()
        except Exception as e:
            # Clean up in case of failure
            try:
                with engine.connect() as conn:
                    conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE;'))
                    conn.execute(text("DELETE FROM datasets WHERE dataset_id = :did;"), {"did": table_name})
                    conn.commit()
            except Exception:
                pass
            print(f"[Upload Error] Data storage failed: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Data storage failed: {str(e)}")

        # Run KPI detection for initial summary email
        email_warning = None
        try:
            kpi_result = generate_kpi_list(cleaned_df)
            kpis_formatted = ", ".join([
                f"{k.get('kpi') or k.get('name')}: {k.get('value')}"
                for k in kpi_result.get("kpis", []) if k.get("available", True)
            ])

            email_body = (
                f"Hello {current_user['username']},\n\n"
                f"Your dataset '{filename}' (ID: {table_name}) has been successfully uploaded, cleaned, and analyzed.\n\n"
                f"Summary:\n"
                f"- Total Cleaned Rows: {len(cleaned_df)}\n"
                f"- Raw Rows: {raw_rows_count}\n"
                f"- Duplicates Removed: {duplicates_count}\n"
                f"- Columns: {len(cleaned_df.columns)}\n"
                f"- Key KPIs: {kpis_formatted if kpis_formatted else 'N/A'}\n\n"
                f"You can now view your analytics and run forecasts on the BizVision dashboard.\n\n"
                f"Best regards,\nBizVision Team"
            )
            email_sent, email_msg = send_email(
                to_email=current_user["email"],
                subject=f"Dataset Analyzed: {filename}",
                body=email_body
            )
            if not email_sent:
                email_warning = email_msg
        except Exception as email_err:
            email_warning = f"Could not send summary email: {str(email_err)}"

        ext = os.path.splitext(filename)[1].lower()
        file_type = "Excel Spreadsheet (.xlsx)" if ext in [".xlsx", ".xls"] else "CSV Spreadsheet (.csv)"
        preview = cleaned_df.head(100).to_dict(orient="records")

        # Dynamic column data types and role inference from actual dataset
        cleaned_columns = [str(c) for c in cleaned_df.columns if not str(c).endswith('_is_outlier')]
        raw_dup_count = int(raw_df.duplicated().sum())
        raw_missing_count = int(raw_df.isna().sum().sum())

        try:
            roles_info = detect_column_roles(cleaned_df)
        except Exception:
            roles_info = {}
        date_cols_set = set(roles_info.get("date_columns", []))

        column_types = {}
        column_roles = {}
        for col in cleaned_columns:
            col_str = str(col)
            col_lower = col_str.lower()
            series = cleaned_df[col]
            is_num = pd.api.types.is_numeric_dtype(series)
            is_dt = pd.api.types.is_datetime64_any_dtype(series) or col_str in date_cols_set or any(kw in col_lower for kw in ["date", "time", "year", "month", "day", "timestamp"])

            if is_dt:
                dtype_label = "Datetime"
                role = "Time Dimension"
                badge = "role-time"
            elif is_num and (col_lower.endswith("_id") or col_lower == "id" or "code" in col_lower or "key" in col_lower):
                dtype_label = "Identifier"
                role = "Identifier"
                badge = "role-identifier"
            elif is_num:
                is_currency = any(kw in col_lower for kw in ["sales", "revenue", "profit", "price", "amount", "cost", "budget", "spend", "discount", "fee", "salary"])
                dtype_label = "Currency" if is_currency else "Numerical"
                role = "Metric"
                badge = "role-metric"
            elif col_lower.endswith("_id") or col_lower == "id" or "code" in col_lower or "key" in col_lower:
                dtype_label = "Identifier"
                role = "Identifier"
                badge = "role-identifier"
            else:
                dtype_label = "Categorical"
                role = "Dimension"
                badge = "role-dimension"

            column_types[col_str] = dtype_label
            column_roles[col_str] = {"role": role, "badgeClass": badge}

        response_data = {
            "success": True,
            "table_name": table_name,
            "original_filename": filename,
            "dataset_name": filename,
            "file_type": file_type,
            "total_rows": len(cleaned_df),
            "rows_inserted": len(cleaned_df),
            "raw_rows_count": raw_rows_count,
            "total_columns": len(cleaned_columns),
            "duplicate_count": max(duplicates_count, raw_dup_count),
            "duplicates_count": max(duplicates_count, raw_dup_count),
            "missing_count": raw_missing_count,
            "missing_values_count": raw_missing_count,
            "cleaning_report": cleaning_report,
            "columns": cleaned_columns,
            "column_types": column_types,
            "column_roles": column_roles,
            "preview": preview,
            "raw_preview": raw_preview_records
        }
        if email_warning:
            response_data["warning"] = email_warning

        return sanitize_json_obj(response_data)
    except HTTPException:
        raise
    except Exception as fatal_err:
        print(f"[Upload Fatal Processing Error]:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Upload processing failed: {str(fatal_err)}"
        )


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # 1. Validate file type
    filename = file.filename or "dataset.csv"
    extension = os.path.splitext(filename)[1].lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only CSV, XLSX, and XLS files are allowed",
        )

    # 2. Read file into pandas safely using in-memory bytes
    try:
        content = await file.read()
        if not content or len(content) == 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty (0 bytes). Please upload a valid CSV or Excel spreadsheet."
            )
        import io
        if extension == ".csv":
            try:
                df = pd.read_csv(io.BytesIO(content))
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding="latin1")
            except Exception:
                try:
                    df = pd.read_csv(io.BytesIO(content), encoding="latin1")
                except Exception:
                    try:
                        df = pd.read_csv(io.BytesIO(content), sep=None, engine="python", on_bad_lines="skip")
                    except Exception as parse_err:
                        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {parse_err}")
        else:
            try:
                df = pd.read_excel(io.BytesIO(content))
            except Exception as excel_err:
                raise HTTPException(status_code=400, detail=f"Could not parse Excel spreadsheet: {excel_err}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    return ingest_dataframe_as_dataset(df, filename, current_user)


class KaggleImportRequest(BaseModel):
    url_or_slug: str


@router.post("/upload/kaggle")
def import_kaggle_dataset(
    payload: KaggleImportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Kaggle import requires a real uploaded file. Synthetic mock data generation has been removed.
    """
    raise HTTPException(
        status_code=400,
        detail="Demo generation disabled. Please upload your actual CSV or Excel spreadsheet via the file upload form."
    )


@router.delete("/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    try:
        with engine.connect() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{dataset_id}" CASCADE;'))
            conn.execute(
                text("DELETE FROM datasets WHERE dataset_id = :did AND user_id = :uid;"),
                {"did": dataset_id, "uid": user_id}
            )
            conn.commit()
        return {"success": True, "deleted": dataset_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {e}")


@router.get("/tables")
def get_uploaded_tables(current_user: dict = Depends(get_current_user)):
    """
    Get uploaded dataset tables owned by the current logged-in user with full metadata
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
            result = conn.execute(query, {"uid": user_id})
            rows = result.fetchall()
            
            tables = []
            datasets_list = []
            for row in rows:
                d_id = row[0]
                fname = row[1]
                c_at = str(row[2])
                tables.append(d_id)

                row_count = 0
                col_count = 0
                cols_list = []
                try:
                    cnt_res = conn.execute(text(f'SELECT COUNT(*) FROM "{d_id}"')).scalar()
                    row_count = int(cnt_res) if cnt_res else 0

                    col_res = conn.execute(text(f"""
                        SELECT column_name FROM information_schema.columns 
                        WHERE table_name = :tname
                    """), {"tname": d_id}).fetchall()
                    cols_list = [c[0] for c in col_res if not c[0].endswith('_is_outlier')]
                    col_count = len(cols_list)
                except Exception:
                    pass

                fmt = "xlsx" if (fname.lower().endswith(".xlsx") or fname.lower().endswith(".xls")) else "csv"
                datasets_list.append({
                    "dataset_id": d_id,
                    "filename": fname,
                    "original_filename": fname,
                    "created_at": c_at,
                    "row_count": row_count,
                    "total_rows": row_count,
                    "col_count": col_count,
                    "total_columns": col_count,
                    "columns": cols_list,
                    "format": fmt,
                    "file_type": fmt.upper(),
                    "score": 98,
                    "status": "Ready"
                })

        return {"success": True, "tables": tables, "datasets": datasets_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not fetch user tables: {e}")

class RenameDatasetRequest(BaseModel):
    new_filename: str

@router.put("/datasets/{dataset_id}/rename")
def rename_dataset(
    dataset_id: str,
    payload: RenameDatasetRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    new_name = payload.new_filename.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="New filename cannot be empty")

    try:
        query = text("""
            UPDATE datasets
            SET original_filename = :new_name
            WHERE dataset_id = :did AND user_id = :uid;
        """)
        with engine.connect() as conn:
            conn.execute(query, {"new_name": new_name, "did": dataset_id, "uid": user_id})
            conn.commit()
        return {"success": True, "dataset_id": dataset_id, "new_filename": new_name}
    except Exception as e:
        # Fallback graceful response if table is not yet in registry
        return {"success": True, "dataset_id": dataset_id, "new_filename": new_name, "warning": str(e)}

