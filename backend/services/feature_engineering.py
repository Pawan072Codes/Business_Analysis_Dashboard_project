import pandas as pd
import numpy as np


def engineer_features(df: pd.DataFrame, date_col: str, target_col: str, granularity: str = "monthly") -> dict:
    """
    df: cleaned dataframe
    date_col: date column ka naam
    target_col: jis metric ko forecast karna hai
    granularity: 'daily', 'weekly', ya 'monthly' — kis level pe data aggregate karna hai
    """
    df = df.copy()

    # ---- Step 0: date parse karo ----
    # dayfirst=True kyunki Superstore jaisa data DD/MM/YYYY format mein aata hai
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce", dayfirst=True)
    df = df.dropna(subset=[date_col, target_col])
    df = df.sort_values(date_col).reset_index(drop=True)

    if len(df) < 10:
        return {
            "success": False,
            "reason": "Not enough data points for forecasting (need at least 10 rows)"
        }

    # ---- Step 0.5: granularity ke hisaab se date ko "round" karo, phir aggregate karo ----
    if granularity == "daily":
        df["period"] = df[date_col].dt.to_period("D")
    elif granularity == "weekly":
        df["period"] = df[date_col].dt.to_period("W")
    elif granularity == "monthly":
        df["period"] = df[date_col].dt.to_period("M")
    else:
        return {"success": False, "reason": f"Unknown granularity: {granularity}"}

    # har period ka total nikalo (sum) — jaise "January 2024 ka total sales"
    df = df.groupby("period", as_index=False)[target_col].sum()

    # period ko wapas normal date mein convert karo (month ka pehla din, jaise)
    df[date_col] = df["period"].dt.to_timestamp()
    df = df.drop(columns=["period"]).sort_values(date_col).reset_index(drop=True)

    min_required = 12 if granularity == "monthly" else 15  # kam periods honge monthly mein, isliye threshold alag
    if len(df) < min_required:
        return {
            "success": False,
            "reason": f"Not enough {granularity} periods for reliable forecasting (found {len(df)}, need at least {min_required})"
        }

    # ---- Step 1: time-based features ----
    df["month"] = df[date_col].dt.month
    df["week"] = df[date_col].dt.isocalendar().week.astype(int)
    df["day_of_week"] = df[date_col].dt.dayofweek
    df["quarter"] = df[date_col].dt.quarter

    # ---- Step 2: lag features ----
    lag_short = 1
    lag_long = 3 if granularity == "monthly" else 7  # monthly mein 3-period lag, daily mein 7-din lag

    df["lag_1"] = df[target_col].shift(lag_short)
    df["lag_7"] = df[target_col].shift(lag_long)

    # ---- Step 3: rolling average ----
    roll_window = 3 if granularity == "monthly" else 7
    df["rolling_avg_7"] = df[target_col].shift(1).rolling(window=roll_window, min_periods=1).mean()

    df = df.dropna().reset_index(drop=True)

    if len(df) < 5:
        return {
            "success": False,
            "reason": "Not enough data left after feature engineering (dataset too small)"
        }

    # ---- Step 4: train/test split (chronological) ----
    split_index = int(len(df) * 0.8)
    train_df = df.iloc[:split_index]
    test_df = df.iloc[split_index:]

    feature_columns = ["month", "week", "day_of_week", "quarter", "lag_1", "lag_7", "rolling_avg_7"]

    return {
        "success": True,
        "full_df": df,
        "train_df": train_df,
        "test_df": test_df,
        "feature_columns": feature_columns,
        "target_column": target_col,
        "date_column": date_col,
        "granularity": granularity
    }