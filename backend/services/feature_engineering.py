import pandas as pd
import numpy as np


def engineer_features(df: pd.DataFrame, date_col: str, target_col: str) -> dict:
    """
    df: cleaned dataframe
    date_col: date column ka naam (e.g. 'order_date')
    target_col: jis metric ko forecast karna hai (e.g. 'total_sales')
    """
    df = df.copy()

    # ---- Step 0: date column type sunishchit karo, sort karo ----
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col, target_col])
    df = df.sort_values(date_col).reset_index(drop=True)

    if len(df) < 10:
        return {
            "success": False,
            "reason": "Not enough data points for forecasting (need at least 10 rows)"
        }

    # agar same date pe multiple rows hain, unhe aggregate karo (sum)
    # taaki har date ki ek hi row ho — forecasting daily/periodic granularity chahti hai
    df = df.groupby(date_col, as_index=False)[target_col].sum()

    # ---- Step 1: time-based features ----
    df["month"] = df[date_col].dt.month
    df["week"] = df[date_col].dt.isocalendar().week.astype(int)
    df["day_of_week"] = df[date_col].dt.dayofweek  # 0=Monday
    df["quarter"] = df[date_col].dt.quarter

    # ---- Step 2: lag features ----
    # pichle period ki target value ko aaj ke row mein daal rahe hain
    df["lag_1"] = df[target_col].shift(1)   # 1 period pehle ki value
    df["lag_7"] = df[target_col].shift(7)   # 7 period pehle ki value (agar weekly pattern hai)

    # ---- Step 3: rolling average ----
    # 7-period moving average — abhi tak ka trend smooth karke dikhata hai
    df["rolling_avg_7"] = df[target_col].shift(1).rolling(window=7, min_periods=1).mean()

    # lag/rolling banane se shuru ke kuch rows mein NaN (missing) aa jate hain
    # kyunki unke "pichle" data points hi nahi hote — unhe hata dete hain
    df = df.dropna().reset_index(drop=True)

    if len(df) < 5:
        return {
            "success": False,
            "reason": "Not enough data left after feature engineering (dataset too small)"
        }

    # ---- Step 4: train/test split (chronological, NOT random) ----
    split_index = int(len(df) * 0.8)  # 80% training, 20% testing
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
        "date_column": date_col
    }