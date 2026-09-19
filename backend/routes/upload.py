import re
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy import create_engine, text
import os
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime
from uuid import uuid4
from services.cleaning import clean_dataset
from services.kpi_detector import generate_kpi_list
from services.email_service import send_email
from routes.auth import get_current_user

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

# Pandas dtype -> PostgreSQL dtype mapping
def map_dtype(pandas_dtype):
    dtype_str = str(pandas_dtype)
    if "int" in dtype_str:
        return "INTEGER"
    elif "float" in dtype_str:
        return "FLOAT"
    elif "datetime" in dtype_str:
        return "TIMESTAMP"
    elif "bool" in dtype_str:
        return "BOOLEAN"
    else:
        return "TEXT"

# clean column names — remove spaces, special chars, lowercase everything
def clean_column_name(name: str) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9_]", "_", name)
    if name[0].isdigit():
        name = "col_" + name
    return name

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    # 1. Validate file type.
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only CSV, XLSX, and XLS files are allowed",
        )

    # 2. read file into pandas
    try:
        if extension == ".csv":
            df = pd.read_csv(file.file)
        else:
            df = pd.read_excel(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file has no data")

    # 3. clean the data — handle missing values, duplicates, dtypes, outliers
    result = clean_dataset(df)
    df = result["cleaned_df"]
    cleaning_report = result["report"]

    # 4. clean column names so SQL doesn't break
    df.columns = [clean_column_name(col) for col in df.columns]

    # 5. generate a unique table name — original filename + timestamp + random suffix
    base_name = re.sub(r"[^a-z0-9_]", "_", os.path.splitext(filename)[0].lower()).strip("_")
    base_name = base_name or "dataset"
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    unique_suffix = uuid4().hex[:8]
    table_name = f"{base_name}_{timestamp}_{unique_suffix}"

    # 6. build CREATE TABLE statement dynamically from df dtypes
    columns_sql = []
    for col_name, dtype in df.dtypes.items():
        pg_type = map_dtype(dtype)
        columns_sql.append(f'"{col_name}" {pg_type}')

    create_table_sql = f'CREATE TABLE "{table_name}" ({", ".join(columns_sql)});'

    user_id = current_user["id"]

    try:
        with engine.connect() as conn:
            conn.execute(text(create_table_sql))
            # Tag dataset with user_id in datasets registry table
            conn.execute(
                text("""
                    INSERT INTO datasets (dataset_id, original_filename, user_id)
                    VALUES (:did, :fname, :uid)
                """),
                {"did": table_name, "fname": filename, "uid": user_id}
            )
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Table creation/registration failed: {e}")

    # 7. insert data using pandas to_sql
    try:
        df.to_sql(table_name, engine, if_exists="append", index=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data insertion failed: {e}")

    # 8. Run KPI detection for initial summary email
    email_warning = None
    try:
        kpi_result = generate_kpi_list(df)
        kpis_formatted = ", ".join([
            f"{k.get('kpi') or k.get('name')}: {k.get('value')}"
            for k in kpi_result.get("kpis", []) if k.get("available", True)
        ])

        
        email_body = (
            f"Hello {current_user['username']},\n\n"
            f"Your dataset '{filename}' (ID: {table_name}) has been successfully uploaded, cleaned, and analyzed.\n\n"
            f"Summary:\n"
            f"- Total Rows: {len(df)}\n"
            f"- Columns: {len(df.columns)}\n"
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

    preview = df.head(5).to_dict(orient="records")

    response_data = {
        "success": True,
        "table_name": table_name,
        "original_filename": filename,
        "rows_inserted": len(df),
        "cleaning_report": cleaning_report,
        "columns": list(df.columns),
        "preview": preview
    }
    if email_warning:
        response_data["warning"] = email_warning

    return response_data

@router.get("/tables")
def get_uploaded_tables(current_user: dict = Depends(get_current_user)):
    """
    Get uploaded dataset tables owned by the current logged-in user
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
            
            # If user has datasets recorded in registry
            if rows:
                tables = [row[0] for row in rows]
                datasets_list = [
                    {"dataset_id": row[0], "filename": row[1], "created_at": str(row[2])}
                    for row in rows
                ]
            else:
                tables = []
                datasets_list = []

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

