import pandas as pd
import numpy as np

def clean_dataset(df: pd.DataFrame) -> dict:
    report = {
        "original_rows": len(df),
        "missing_values_before": {},
        "missing_values_handled": {},
        "duplicates_removed": 0,
        "dtype_fixes": [],
        "outliers_flagged": {},
        "final_rows": 0
    }

    # ---- 1. MISSING VALUES ----
    missing_counts = df.isnull().sum()
    report["missing_values_before"] = {
        col: int(count) for col, count in missing_counts.items() if count > 0
    }

    for col in df.columns:
        missing_count = df[col].isnull().sum()
        if missing_count == 0:
            continue

        missing_pct = missing_count / len(df)

        if missing_pct < 0.05:
            # very few missing -> safe to drop just those rows
            df = df.dropna(subset=[col])
            report["missing_values_handled"][col] = f"dropped {missing_count} rows (<5% missing)"
        else:
            if pd.api.types.is_numeric_dtype(df[col]):
                fill_value = df[col].median()
                df[col] = df[col].fillna(fill_value)
                report["missing_values_handled"][col] = f"filled with median ({fill_value})"
            else:
                # try date conversion check first — skip fill for dates
                mode_value = df[col].mode()
                if not mode_value.empty:
                    df[col] = df[col].fillna(mode_value[0])
                    report["missing_values_handled"][col] = f"filled with mode ({mode_value[0]})"

    # ---- 2. DUPLICATES ----
    before = len(df)
    df = df.drop_duplicates()
    report["duplicates_removed"] = before - len(df)

    # ---- 3. DATA TYPE FIXES (auto-detect date-like text columns) ----
    for col in df.columns:
        if df[col].dtype == "object":  # text column
            sample = df[col].dropna().head(20)
            try:
                converted = pd.to_datetime(sample, errors="coerce")
                # if most values convert successfully, treat column as date
                success_rate = converted.notnull().sum() / len(sample) if len(sample) > 0 else 0
                if success_rate > 0.8:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                    report["dtype_fixes"].append(f"{col}: converted text to datetime")
            except Exception:
                pass

    # ---- 4. OUTLIER DETECTION (IQR method, numeric columns only) ----
    for col in df.select_dtypes(include=[np.number]).columns:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR

        outliers = df[(df[col] < lower_bound) | (df[col] > upper_bound)]
        if len(outliers) > 0:
            report["outliers_flagged"][col] = {
                "count": len(outliers),
                "lower_bound": round(lower_bound, 2),
                "upper_bound": round(upper_bound, 2)
            }
            # flag, don't remove — add a marker column
            df[f"{col}_is_outlier"] = (df[col] < lower_bound) | (df[col] > upper_bound)

    report["final_rows"] = len(df)

    return {"cleaned_df": df, "report": report}