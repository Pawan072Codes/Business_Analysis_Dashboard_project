import pandas as pd
import numpy as np

def clean_dataset(df: pd.DataFrame) -> dict:
    # Ensure all column names are strings
    df.columns = [str(c) for c in df.columns]

    report = {
        "original_rows": len(df),
        "missing_values_before": {},
        "missing_values_handled": {},
        "duplicates_removed": 0,
        "dtype_fixes": [],
        "outliers_flagged": {},
        "final_rows": 0
    }

    if df is None or (isinstance(df, pd.DataFrame) and df.empty) or len(df) == 0:
        report["final_rows"] = 0
        return {"cleaned_df": df, "report": report}

    # ---- 1. MISSING VALUES ----
    missing_counts = df.isnull().sum()
    report["missing_values_before"] = {
        str(col): int(count) for col, count in missing_counts.items() if count > 0
    }

    for col in list(df.columns):
        if col not in df.columns:
            continue
        missing_count = int(df[col].isnull().sum())
        if missing_count == 0:
            continue

        current_len = len(df)
        if current_len == 0:
            break
        missing_pct = missing_count / current_len

        if missing_pct < 0.05 and current_len > 10:
            # very few missing -> safe to drop just those rows if dataset is large enough
            test_df = df.dropna(subset=[col])
            if isinstance(test_df, pd.DataFrame) and not test_df.empty and len(test_df) > 0:
                df = test_df
                report["missing_values_handled"][str(col)] = f"dropped {missing_count} rows (<5% missing)"
            else:
                mode_res = df[col].mode()
                fill_value = df[col].median() if pd.api.types.is_numeric_dtype(df[col]) else (mode_res[0] if (isinstance(mode_res, pd.Series) and not mode_res.empty and len(mode_res) > 0) else "Unknown")
                df[col] = df[col].fillna(fill_value)
                report["missing_values_handled"][str(col)] = f"filled missing ({fill_value})"
        else:
            if pd.api.types.is_numeric_dtype(df[col]):
                med = df[col].median()
                fill_value = 0 if (pd.isna(med) if not isinstance(med, (np.ndarray, pd.Series)) else True) else med
                df[col] = df[col].fillna(fill_value)
                report["missing_values_handled"][str(col)] = f"filled with median ({fill_value})"
            else:
                mode_value = df[col].mode()
                fill_value = mode_value[0] if (isinstance(mode_value, pd.Series) and not mode_value.empty and len(mode_value) > 0) else "Unknown"
                df[col] = df[col].fillna(fill_value)
                report["missing_values_handled"][str(col)] = f"filled with mode ({fill_value})"

    # ---- 2. DUPLICATES ----
    before = len(df)
    df = df.drop_duplicates()
    report["duplicates_removed"] = before - len(df)

    # ---- 3. DATA TYPE FIXES (auto-detect date-like text columns) ----
    for col in list(df.columns):
        if df[col].dtype == "object":  # text column
            sample = df[col].dropna().head(20)
            try:
                converted = pd.to_datetime(sample, errors="coerce")
                success_rate = converted.notnull().sum() / len(sample) if len(sample) > 0 else 0
                if success_rate > 0.8:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                    report["dtype_fixes"].append(f"{col}: converted text to datetime")
            except Exception:
                pass

    # ---- 4. OUTLIER DETECTION (IQR method, numeric columns only) ----
    for col in list(df.select_dtypes(include=[np.number]).columns):
        try:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR

            outliers = df[(df[col] < lower_bound) | (df[col] > upper_bound)]
            if isinstance(outliers, pd.DataFrame) and not outliers.empty and len(outliers) > 0:
                lb_val = float(lower_bound) if pd.notnull(lower_bound) and not np.isinf(lower_bound) else 0.0
                ub_val = float(upper_bound) if pd.notnull(upper_bound) and not np.isinf(upper_bound) else 0.0
                report["outliers_flagged"][str(col)] = {
                    "count": int(len(outliers)),
                    "lower_bound": round(lb_val, 2),
                    "upper_bound": round(ub_val, 2)
                }
                # flag, don't remove — add a marker column
                df[f"{col}_is_outlier"] = (df[col] < lower_bound) | (df[col] > upper_bound)
        except Exception:
            pass

    report["final_rows"] = len(df)

    return {"cleaned_df": df, "report": report}
