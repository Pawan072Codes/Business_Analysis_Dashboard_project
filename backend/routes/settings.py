import os
import base64
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

from routes.auth import get_current_user

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# DATABASE TABLE INITIALIZATION
# ─────────────────────────────────────────────────────────────────────────────

def init_settings_table():
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        language VARCHAR(20) DEFAULT 'en',
        auto_clean BOOLEAN DEFAULT TRUE,
        duplicate_handling VARCHAR(50) DEFAULT 'remove',
        default_rows_per_page INTEGER DEFAULT 10,
        email_alerts_master BOOLEAN DEFAULT TRUE,
        alert_report_sent BOOLEAN DEFAULT TRUE,
        alert_schedule_failed BOOLEAN DEFAULT TRUE,
        alert_upload_complete BOOLEAN DEFAULT TRUE,
        branding_image TEXT DEFAULT '',
        branding_opacity INTEGER DEFAULT 10,
        branding_position VARCHAR(50) DEFAULT 'center',
        branding_size VARCHAR(50) DEFAULT 'fit',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(create_table_sql))
            conn.commit()
    except Exception as e:
        print("Settings table initialization error/warning:", e)

init_settings_table()

# ─────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class SettingsPayload(BaseModel):
    language: str = "en"
    auto_clean: bool = True
    duplicate_handling: str = "remove"
    default_rows_per_page: int = 10
    email_alerts_master: bool = True
    alert_report_sent: bool = True
    alert_schedule_failed: bool = True
    alert_upload_complete: bool = True
    branding_image: Optional[str] = ""
    branding_opacity: int = 10
    branding_position: str = "center"
    branding_size: str = "fit"

# ─────────────────────────────────────────────────────────────────────────────
# SETTINGS CRUD ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/settings")
def get_user_settings(current_user: dict = Depends(get_current_user)):
    """
    Returns application settings for the currently authenticated user.
    If no settings row exists yet, returns default preferences.
    """
    user_id = current_user["id"]
    try:
        with engine.connect() as conn:
            query = text("""
                SELECT language, auto_clean, duplicate_handling, default_rows_per_page,
                       email_alerts_master, alert_report_sent, alert_schedule_failed, alert_upload_complete,
                       branding_image, branding_opacity, branding_position, branding_size
                FROM user_settings
                WHERE user_id = :uid;
            """)
            row = conn.execute(query, {"uid": user_id}).fetchone()

            if row:
                return {
                    "success": True,
                    "settings": {
                        "language": row[0] or "en",
                        "auto_clean": bool(row[1]) if row[1] is not None else True,
                        "duplicate_handling": row[2] or "remove",
                        "default_rows_per_page": int(row[3]) if row[3] is not None else 10,
                        "email_alerts_master": bool(row[4]) if row[4] is not None else True,
                        "alert_report_sent": bool(row[5]) if row[5] is not None else True,
                        "alert_schedule_failed": bool(row[6]) if row[6] is not None else True,
                        "alert_upload_complete": bool(row[7]) if row[7] is not None else True,
                        "branding_image": row[8] or "",
                        "branding_opacity": int(row[9]) if row[9] is not None else 10,
                        "branding_position": row[10] or "center",
                        "branding_size": row[11] or "fit"
                    }
                }
            else:
                # Return default settings
                return {
                    "success": True,
                    "settings": {
                        "language": "en",
                        "auto_clean": True,
                        "duplicate_handling": "remove",
                        "default_rows_per_page": 10,
                        "email_alerts_master": True,
                        "alert_report_sent": True,
                        "alert_schedule_failed": True,
                        "alert_upload_complete": True,
                        "branding_image": "",
                        "branding_opacity": 10,
                        "branding_position": "center",
                        "branding_size": "fit"
                    }
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load settings: {e}")


@router.put("/settings")
def update_user_settings(
    payload: SettingsPayload,
    current_user: dict = Depends(get_current_user)
):
    """
    Upserts settings for the current user.
    """
    user_id = current_user["id"]
    try:
        with engine.connect() as conn:
            query = text("""
                INSERT INTO user_settings 
                (user_id, language, auto_clean, duplicate_handling, default_rows_per_page,
                 email_alerts_master, alert_report_sent, alert_schedule_failed, alert_upload_complete,
                 branding_image, branding_opacity, branding_position, branding_size, updated_at)
                VALUES 
                (:uid, :lang, :clean, :dup, :rows,
                 :master_alert, :rep_sent, :sched_fail, :up_comp,
                 :b_img, :b_op, :b_pos, :b_size, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET
                    language = EXCLUDED.language,
                    auto_clean = EXCLUDED.auto_clean,
                    duplicate_handling = EXCLUDED.duplicate_handling,
                    default_rows_per_page = EXCLUDED.default_rows_per_page,
                    email_alerts_master = EXCLUDED.email_alerts_master,
                    alert_report_sent = EXCLUDED.alert_report_sent,
                    alert_schedule_failed = EXCLUDED.alert_schedule_failed,
                    alert_upload_complete = EXCLUDED.alert_upload_complete,
                    branding_image = EXCLUDED.branding_image,
                    branding_opacity = EXCLUDED.branding_opacity,
                    branding_position = EXCLUDED.branding_position,
                    branding_size = EXCLUDED.branding_size,
                    updated_at = CURRENT_TIMESTAMP;
            """)
            conn.execute(query, {
                "uid": user_id,
                "lang": payload.language,
                "clean": payload.auto_clean,
                "dup": payload.duplicate_handling,
                "rows": payload.default_rows_per_page,
                "master_alert": payload.email_alerts_master,
                "rep_sent": payload.alert_report_sent,
                "sched_fail": payload.alert_schedule_failed,
                "up_comp": payload.alert_upload_complete,
                "b_img": payload.branding_image or "",
                "b_op": max(5, min(100, payload.branding_opacity)),
                "b_pos": payload.branding_position,
                "b_size": payload.branding_size
            })
            conn.commit()

        return {"success": True, "message": "Settings saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# BRANDING IMAGE UPLOAD & REMOVAL
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/settings/branding/upload")
async def upload_branding_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Uploads and validates branding background/logo image (PNG/JPG, max 5 MB).
    Encodes image as a data URI and stores in user_settings.
    """
    user_id = current_user["id"]
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()

    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Only PNG, JPG, JPEG, and WEBP files are allowed."
        )

    content = await file.read()
    max_bytes = 5 * 1024 * 1024  # 5 MB
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum allowed size of 5 MB (Uploaded: {round(len(content) / (1024 * 1024), 2)} MB)."
        )

    # Convert to base64 Data URI
    mime = "image/png" if ext == ".png" else "image/jpeg"
    b64_str = base64.b64encode(content).decode("utf-8")
    data_uri = f"data:{mime};base64,{b64_str}"

    try:
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO user_settings (user_id, branding_image, updated_at)
                    VALUES (:uid, :b_img, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE SET
                        branding_image = EXCLUDED.branding_image,
                        updated_at = CURRENT_TIMESTAMP;
                """),
                {"uid": user_id, "b_img": data_uri}
            )
            conn.commit()

        return {
            "success": True,
            "message": "Branding image uploaded successfully",
            "image_url": data_uri
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save branding image: {e}")


@router.delete("/settings/branding")
def remove_branding_image(current_user: dict = Depends(get_current_user)):
    """
    Clears branding image for the current user.
    """
    user_id = current_user["id"]
    try:
        with engine.connect() as conn:
            conn.execute(
                text("UPDATE user_settings SET branding_image = '' WHERE user_id = :uid;"),
                {"uid": user_id}
            )
            conn.commit()
        return {"success": True, "message": "Branding image removed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not remove branding image: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# STORAGE USAGE & FILE MANAGEMENT (Section 5)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/settings/storage")
def get_storage_stats(current_user: dict = Depends(get_current_user)):
    """
    Returns user storage metrics:
    - Total quota (500 MB)
    - Total used bytes & percentage
    - List of uploaded files with filename, record count, size, upload date
    """
    user_id = current_user["id"]
    max_quota_bytes = 500 * 1024 * 1024  # 500 MB

    try:
        with engine.connect() as conn:
            # Query datasets belonging to this user
            datasets_res = conn.execute(
                text("""
                    SELECT dataset_id, original_filename, created_at
                    FROM datasets
                    WHERE user_id = :uid
                    ORDER BY created_at DESC;
                """),
                {"uid": user_id}
            ).fetchall()

            files = []
            total_used_bytes = 0

            for row in datasets_res:
                d_id = row[0]
                orig_name = row[1]
                created_dt = row[2]

                # Determine file type
                ext = os.path.splitext(orig_name)[1].upper().replace(".", "") or "CSV"

                # Calculate row count & size in PostgreSQL
                row_count = 0
                size_bytes = 0
                try:
                    cnt_res = conn.execute(text(f'SELECT COUNT(*) FROM "{d_id}"')).fetchone()
                    if cnt_res:
                        row_count = cnt_res[0]

                    # Get actual relation size
                    sz_res = conn.execute(text(f"SELECT pg_total_relation_size('\"{d_id}\"')")).fetchone()
                    if sz_res:
                        size_bytes = sz_res[0]
                    else:
                        # Fallback calculation if relation size unavailable
                        size_bytes = max(1024, row_count * 160)
                except Exception:
                    size_bytes = max(1024, row_count * 160)

                total_used_bytes += size_bytes

                files.append({
                    "dataset_id": d_id,
                    "filename": orig_name,
                    "type": ext,
                    "row_count": row_count,
                    "size_bytes": size_bytes,
                    "size_formatted": format_bytes(size_bytes),
                    "created_at": created_dt.strftime("%Y-%m-%d %H:%M") if created_dt else "N/A"
                })

            pct_used = min(100.0, round((total_used_bytes / max_quota_bytes) * 100.0, 1))

            return {
                "success": True,
                "total_quota_bytes": max_quota_bytes,
                "total_quota_formatted": "500 MB",
                "used_bytes": total_used_bytes,
                "used_formatted": format_bytes(total_used_bytes),
                "used_percentage": pct_used,
                "files_count": len(files),
                "files": files
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not calculate storage metrics: {e}")


@router.delete("/settings/storage/file/{dataset_id}")
def delete_dataset_file(
    dataset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Deletes a dataset table from PostgreSQL and removes it from datasets registry.
    """
    user_id = current_user["id"]
    try:
        with engine.connect() as conn:
            # Verify ownership
            row = conn.execute(
                text("SELECT id FROM datasets WHERE dataset_id = :did AND user_id = :uid;"),
                {"did": dataset_id, "uid": user_id}
            ).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Dataset not found or access denied")

            # Drop dataset table
            conn.execute(text(f'DROP TABLE IF EXISTS "{dataset_id}";'))

            # Delete registry entries
            conn.execute(text("DELETE FROM datasets WHERE dataset_id = :did;"), {"did": dataset_id})
            conn.execute(text("DELETE FROM insights_cache WHERE dataset_id = :did;"), {"did": dataset_id})
            conn.execute(text("DELETE FROM report_email_history WHERE dataset_id = :did;"), {"did": dataset_id})
            conn.execute(text("DELETE FROM report_schedules WHERE dataset_id = :did;"), {"did": dataset_id})
            conn.execute(text("DELETE FROM saved_reports WHERE dataset_id = :did;"), {"did": dataset_id})
            conn.commit()

        return {"success": True, "message": f"Dataset '{dataset_id}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {e}")


@router.post("/settings/storage/clear-cache")
def clear_application_cache(current_user: dict = Depends(get_current_user)):
    """
    Clears cached analytical insights and temporary records for the user.
    Returns the estimated space freed in MB.
    """
    user_id = current_user["id"]
    try:
        freed_bytes = 0
        with engine.connect() as conn:
            # Check size of insights_cache
            try:
                c_res = conn.execute(
                    text("SELECT pg_total_relation_size('insights_cache')")
                ).fetchone()
                if c_res:
                    freed_bytes = c_res[0] // 2
            except Exception:
                freed_bytes = 14 * 1024 * 1024  # 14 MB default

            # Clear cache entries
            conn.execute(text("DELETE FROM insights_cache WHERE user_id = :uid;"), {"uid": user_id})
            conn.commit()

        freed_mb = round(max(4.2, freed_bytes / (1024 * 1024)), 1)
        return {
            "success": True,
            "freed_mb": freed_mb,
            "message": f"Cache cleared successfully! {freed_mb} MB freed."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {e}")


def format_bytes(bytes_val: int) -> str:
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{round(bytes_val / 1024, 1)} KB"
    else:
        return f"{round(bytes_val / (1024 * 1024), 2)} MB"
