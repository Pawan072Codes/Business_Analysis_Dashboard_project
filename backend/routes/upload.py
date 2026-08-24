import re
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
from datetime import datetime
from services.cleaning import clean_dataset

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()

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
async def upload_file(file: UploadFile = File(...)):
    # 1. validate file type
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel files allowed")

    # 2. read file into pandas
    try:
        if file.filename.endswith(".csv"):
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

    # 5. generate a unique table name — original filename + timestamp
    base_name = re.sub(r"[^a-z0-9_]", "_", file.filename.rsplit(".", 1)[0].lower())
    table_name = f"{base_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # 6. build CREATE TABLE statement dynamically from df dtypes
    columns_sql = []
    for col_name, dtype in df.dtypes.items():
        pg_type = map_dtype(dtype)
        columns_sql.append(f'"{col_name}" {pg_type}')

    create_table_sql = f'CREATE TABLE "{table_name}" ({", ".join(columns_sql)});'

    try:
        with engine.connect() as conn:
            conn.execute(text(create_table_sql))
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Table creation failed: {e}")

    # 7. insert data using pandas to_sql
    try:
        df.to_sql(table_name, engine, if_exists="append", index=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data insertion failed: {e}")

    # 8. return success + cleaning report + preview
    preview = df.head(5).to_dict(orient="records")

    return {
        "success": True,
        "table_name": table_name,
        "rows_inserted": len(df),
        "cleaning_report": cleaning_report,
        "columns": list(df.columns),
        "preview": preview
    }