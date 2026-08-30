import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
from datetime import timedelta

from services.forecasting_model import load_model
from services.feature_engineering import engineer_features
from services.kpi_detector import detect_column_roles
from services.forecasting_model import load_model, train_forecasting_model

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()


@router.get("/forecast/{table_name}")
def get_forecast(table_name: str, days: int = Query(default=30, ge=1, le=180)):

    """
    table_name: kis dataset ka forecast chahiye (upload ke time bana table naam)
    days: kitne din aage predict karna hai (default 30, max 180)
    """

    # ---- 1. saved model load karo ----
    model = load_model(table_name)
    if model is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained model found for '{table_name}'. Train a model first."
        )

    # ---- 2. database se original data wapas padho ----
    try:
        df = pd.read_sql(f'SELECT * FROM "{table_name}"', engine)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read table: {e}")

    # ---- 3. date aur revenue-type column detect karo (Phase 5 wala logic reuse) ----
    roles = detect_column_roles(df)
    if not roles["date_columns"] or not roles["revenue_columns"]:
        raise HTTPException(
            status_code=400,
            detail="Dataset does not have a suitable date + numeric column for forecasting"
        )

    date_col = roles["date_columns"][0]
    target_col = roles["revenue_columns"][0]

    # ---- 4. wahi feature engineering pipeline chalao (training jaisa hi) ----
    feature_result = engineer_features(df, date_col=date_col, target_col=target_col, granularity="monthly")
    if not feature_result["success"]:
        raise HTTPException(status_code=400, detail=feature_result["reason"])

    full_df = feature_result["full_df"].copy()
    feature_columns = feature_result["feature_columns"]

    # ---- 5. RECURSIVE forecasting — ek-ek din aage badhte hue predict karo ----
    last_date = full_df[date_col].max()
    history = full_df[target_col].tolist()  # ye list aage predictions se update hoti jayegi

    forecast_results = []

    for i in range(1, days + 1):
        next_date = last_date + timedelta(days=i)

        # naye row ke liye features banao — jaise engineer_features banata hai
        lag_1 = history[-1]
        lag_7 = history[-7] if len(history) >= 7 else history[0]
        rolling_avg_7 = sum(history[-7:]) / len(history[-7:])

        new_row_features = pd.DataFrame([{
            "month": next_date.month,
            "week": next_date.isocalendar()[1],
            "day_of_week": next_date.weekday(),
            "quarter": (next_date.month - 1) // 3 + 1,
            "lag_1": lag_1,
            "lag_7": lag_7,
            "rolling_avg_7": rolling_avg_7
        }])[feature_columns]  # sahi column order maintain karo

        prediction = model.predict(new_row_features)[0]

        forecast_results.append({
            "date": next_date.strftime("%Y-%m-%d"),
            "predicted_value": round(float(prediction), 2)
        })

        # is prediction ko history mein add karo, taaki agla din isse lag feature bana sake
        history.append(prediction)

    # ---- 6. historical data bhi bhejo (chart mein "actual" line ke liye) ----
    historical_data = [
        {"date": row[date_col].strftime("%Y-%m-%d"), "actual_value": round(float(row[target_col]), 2)}
        for _, row in full_df.iterrows()
    ]

    return {
        "table_name": table_name,
        "target_column": target_col,
        "date_column": date_col,
        "forecast_days": days,
        "historical": historical_data,
        "forecast": forecast_results
    }

@router.post("/train/{table_name}")
def train_model(table_name: str):
    """
    Database table se data padhta hai, feature engineering karta hai,
    model train karta hai, aur save karta hai — taaki baad mein
    /forecast endpoint use kar sake.
    """
    try:
        df = pd.read_sql(f'SELECT * FROM "{table_name}"', engine)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read table: {e}")

    roles = detect_column_roles(df)
    if not roles["date_columns"] or not roles["revenue_columns"]:
        raise HTTPException(
            status_code=400,
            detail="Dataset does not have a suitable date + numeric column for training"
        )

    date_col = roles["date_columns"][0]
    target_col = roles["revenue_columns"][0]

    feature_result = engineer_features(df, date_col=date_col, target_col=target_col, granularity="monthly")
    if not feature_result["success"]:
        raise HTTPException(status_code=400, detail=feature_result["reason"])

    training_result = train_forecasting_model(feature_result, table_name=table_name)

    return {
        "success": True,
        "table_name": table_name,
        "date_column": date_col,
        "target_column": target_col,
        "chosen_model": training_result["chosen_model"],
        "metrics": training_result["metrics"],
        "comparison": training_result["comparison"]
    }