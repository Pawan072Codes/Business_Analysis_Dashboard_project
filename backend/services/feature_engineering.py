import pandas as pd
import numpy as np


def engineer_features(df: pd.DataFrame, date_col: str = None, target_col: str = None, granularity: str = "auto") -> dict:
    """
    Robust time-series feature engineering.
    Handles any dataset schema, missing date columns, and variable row sizes.
    Never fails on short datasets (>= 3 rows).
    """
    if df is None or (isinstance(df, pd.DataFrame) and df.empty) or len(df) == 0:
        return {"success": False, "reason": "Dataset is empty (0 rows)."}

    df = df.copy()

    # 1. Identify target numeric column
    if not target_col or target_col not in df.columns or not pd.api.types.is_numeric_dtype(df[target_col]):
        numeric_candidates = [c for c in df.select_dtypes(include="number").columns if not str(c).endswith("_is_outlier")]
        if not numeric_candidates:
            return {"success": False, "reason": "No numeric metric column found in dataset to forecast."}
        target_col = numeric_candidates[0]

    df[target_col] = pd.to_numeric(df[target_col], errors="coerce")
    df = df.dropna(subset=[target_col])
    if len(df) < 3:
        return {"success": False, "reason": f"Not enough valid numeric values in column '{target_col}' (need at least 3)."}

    # 2. Identify / validate date column
    has_valid_dates = False
    if date_col and date_col in df.columns:
        parsed_dates = pd.to_datetime(df[date_col], errors="coerce", dayfirst=True)
        if parsed_dates.notnull().sum() >= max(2, int(len(df) * 0.3)):
            df[date_col] = parsed_dates
            df = df.dropna(subset=[date_col])
            has_valid_dates = True

    if not has_valid_dates:
        # Check other columns for date-like strings
        for c in df.columns:
            if c != target_col and not str(c).endswith("_is_outlier"):
                parsed_c = pd.to_datetime(df[c], errors="coerce", dayfirst=True)
                if parsed_c.notnull().sum() >= max(2, int(len(df) * 0.5)):
                    date_col = c
                    df[date_col] = parsed_c
                    df = df.dropna(subset=[date_col])
                    has_valid_dates = True
                    break

    # If no valid date column exists, synthesize timeline progression
    if not has_valid_dates or len(df) < 3:
        date_col = "_timeline_date"
        df[date_col] = pd.date_range(end=pd.Timestamp.now().normalize(), periods=len(df), freq='D')

    df = df.sort_values(date_col).reset_index(drop=True)

    # 3. Adaptive aggregation
    date_span = (df[date_col].max() - df[date_col].min()).days if len(df) > 1 else 0

    if granularity == "auto" or granularity == "monthly":
        if date_span >= 365 and len(df) >= 30:
            active_granularity = "monthly"
        elif date_span >= 60 and len(df) >= 20:
            active_granularity = "weekly"
        else:
            active_granularity = "daily"
    else:
        active_granularity = granularity

    # Aggregate if dataset is large enough, otherwise retain daily/row-level resolution
    if active_granularity == "monthly" and len(df) >= 24:
        df["period"] = df[date_col].dt.to_period("M")
        agg_df = df.groupby("period", as_index=False)[target_col].sum()
        agg_df[date_col] = agg_df["period"].dt.to_timestamp()
        agg_df = agg_df.drop(columns=["period"]).sort_values(date_col).reset_index(drop=True)
        if len(agg_df) >= 8:
            df = agg_df
        else:
            active_granularity = "daily"
    elif active_granularity == "weekly" and len(df) >= 20:
        df["period"] = df[date_col].dt.to_period("W")
        agg_df = df.groupby("period", as_index=False)[target_col].sum()
        agg_df[date_col] = agg_df["period"].dt.to_timestamp()
        agg_df = agg_df.drop(columns=["period"]).sort_values(date_col).reset_index(drop=True)
        if len(agg_df) >= 8:
            df = agg_df
        else:
            active_granularity = "daily"
    else:
        active_granularity = "daily"

    # 4. Feature Extraction (calendar, lags, rolling averages)
    df["month"] = df[date_col].dt.month
    df["week"] = df[date_col].dt.isocalendar().week.astype(int)
    df["day_of_week"] = df[date_col].dt.dayofweek
    df["quarter"] = df[date_col].dt.quarter

    lag_window_1 = 1
    lag_window_7 = min(3, max(1, len(df) // 3))
    roll_window = min(3, max(1, len(df) // 2))

    df["lag_1"] = df[target_col].shift(lag_window_1).bfill().ffill()
    df["lag_7"] = df[target_col].shift(lag_window_7).bfill().ffill()
    df["rolling_avg_7"] = df[target_col].shift(1).rolling(window=roll_window, min_periods=1).mean().bfill().ffill()

    # Fill any remaining NaNs safely
    med_val = float(df[target_col].median()) if not df[target_col].empty else 0.0
    for col in ["lag_1", "lag_7", "rolling_avg_7"]:
        df[col] = df[col].fillna(med_val)

    # 5. Chronological Train/Test Split
    if len(df) <= 4:
        train_df = df.copy()
        test_df = df.copy()
    else:
        split_idx = max(3, int(len(df) * 0.8))
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:]
        if test_df.empty:
            test_df = train_df.tail(2)

    feature_columns = ["month", "week", "day_of_week", "quarter", "lag_1", "lag_7", "rolling_avg_7"]

    return {
        "success": True,
        "full_df": df,
        "train_df": train_df,
        "test_df": test_df,
        "feature_columns": feature_columns,
        "target_column": target_col,
        "date_column": date_col,
        "granularity": active_granularity
    }
