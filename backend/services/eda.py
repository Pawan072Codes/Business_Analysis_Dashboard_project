import os
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # server pe chalane ke liye — GUI window nahi khulti, seedha file save karta hai
import matplotlib.pyplot as plt
import seaborn as sns

# jaha charts save honge
CHARTS_DIR = "static/charts"
os.makedirs(CHARTS_DIR, exist_ok=True)


def generate_summary_stats(df: pd.DataFrame) -> dict:
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.empty:
        return {}

    summary = {}
    for col in numeric_df.columns:
        summary[col] = {
            "mean": round(numeric_df[col].mean(), 2),
            "median": round(numeric_df[col].median(), 2),
            "min": round(numeric_df[col].min(), 2),
            "max": round(numeric_df[col].max(), 2),
            "std": round(numeric_df[col].std(), 2)
        }
    return summary


def find_date_column(df: pd.DataFrame):
    # datetime type wala column dhoondo
    date_cols = df.select_dtypes(include="datetime").columns
    return date_cols[0] if len(date_cols) > 0 else None


def generate_trend_chart(df: pd.DataFrame, table_name: str) -> str | None:
    date_col = find_date_column(df)
    numeric_cols = df.select_dtypes(include="number").columns

    if date_col is None or len(numeric_cols) == 0:
        return None  # date column nahi mila, trend chart skip

    # pehla numeric column use karte hain trend ke liye
    value_col = numeric_cols[0]

    trend_df = df[[date_col, value_col]].dropna().sort_values(date_col)

    plt.figure(figsize=(10, 5))
    plt.plot(trend_df[date_col], trend_df[value_col], marker="o", color="#2563eb")
    plt.title(f"{value_col} Trend Over Time")
    plt.xlabel(date_col)
    plt.ylabel(value_col)
    plt.xticks(rotation=45)
    plt.tight_layout()

    filename = f"{table_name}_trend.png"
    filepath = os.path.join(CHARTS_DIR, filename)
    plt.savefig(filepath)
    plt.close()

    return filename


def generate_distribution_plots(df: pd.DataFrame, table_name: str) -> list:
    numeric_cols = df.select_dtypes(include="number").columns
    filenames = []

    for col in numeric_cols:
        # skip outlier-flag columns jo cleaning.py ne banaye the
        if col.endswith("_is_outlier"):
            continue

        plt.figure(figsize=(8, 5))
        sns.histplot(df[col].dropna(), kde=True, color="#16a34a")
        plt.title(f"Distribution of {col}")
        plt.xlabel(col)
        plt.ylabel("Frequency")
        plt.tight_layout()

        filename = f"{table_name}_{col}_distribution.png"
        filepath = os.path.join(CHARTS_DIR, filename)
        plt.savefig(filepath)
        plt.close()

        filenames.append(filename)

    return filenames


def generate_correlation_heatmap(df: pd.DataFrame, table_name: str) -> str | None:
    numeric_df = df.select_dtypes(include="number")
    # outlier flag columns hata do, wo correlation ke liye meaningful nahi
    numeric_df = numeric_df[[c for c in numeric_df.columns if not c.endswith("_is_outlier")]]

    if numeric_df.shape[1] < 2:
        return None  # kam se kam 2 numeric columns chahiye correlation ke liye

    corr = numeric_df.corr()

    plt.figure(figsize=(8, 6))
    sns.heatmap(corr, annot=True, cmap="coolwarm", center=0, fmt=".2f")
    plt.title("Correlation Heatmap")
    plt.tight_layout()

    filename = f"{table_name}_correlation.png"
    filepath = os.path.join(CHARTS_DIR, filename)
    plt.savefig(filepath)
    plt.close()

    return filename


def run_eda(df: pd.DataFrame, table_name: str) -> dict:
    summary_stats = generate_summary_stats(df)
    trend_chart = generate_trend_chart(df, table_name)
    distribution_charts = generate_distribution_plots(df, table_name)
    correlation_chart = generate_correlation_heatmap(df, table_name)

    return {
        "summary_stats": summary_stats,
        "charts": {
            "trend_chart": trend_chart,
            "distribution_charts": distribution_charts,
            "correlation_chart": correlation_chart
        }
    }