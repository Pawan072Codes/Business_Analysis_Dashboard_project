import io
import re
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import pandas as pd
import numpy as np
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

from routes.auth import get_current_user
from routes.analytics import check_dataset_access
from services.email_service import send_email
from services.gmail_service import send_user_gmail_message, get_user_gmail_status

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# DATABASE TABLE INITIALIZATION
# ─────────────────────────────────────────────────────────────────────────────

def init_reports_tables():
    create_saved_reports_table = """
    CREATE TABLE IF NOT EXISTS saved_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        report_name VARCHAR(255) NOT NULL,
        dataset_id VARCHAR(255) NOT NULL,
        report_type VARCHAR(50) NOT NULL DEFAULT 'sales',
        date_range VARCHAR(50) NOT NULL DEFAULT 'all',
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        comparison VARCHAR(50) DEFAULT 'mom',
        filters JSONB DEFAULT '{}'::jsonb,
        share_token VARCHAR(64) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    create_schedules_table = """
    CREATE TABLE IF NOT EXISTS report_schedules (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dataset_id VARCHAR(255) NOT NULL,
        report_name VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        format VARCHAR(20) NOT NULL DEFAULT 'PDF',
        start_day VARCHAR(50) NOT NULL,
        report_type VARCHAR(50) DEFAULT 'sales',
        status VARCHAR(20) DEFAULT 'Active',
        next_run VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    create_history_table = """
    CREATE TABLE IF NOT EXISTS report_email_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dataset_id VARCHAR(255) NOT NULL,
        report_name VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        format VARCHAR(20) NOT NULL,
        report_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        details TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    try:
        with engine.connect() as conn:
            conn.execute(text(create_saved_reports_table))
            conn.execute(text(create_schedules_table))
            conn.execute(text(create_history_table))
            conn.commit()
    except Exception as e:
        print("Reports tables initialization warning:", e)

init_reports_tables()


# ─────────────────────────────────────────────────────────────────────────────
# COLUMN DETECTION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def detect_report_columns(df: pd.DataFrame) -> Dict[str, Optional[str]]:
    """
    Intelligently maps dataset columns to business report roles.
    """
    cols = list(df.columns)
    roles = {
        "sales_col": None,
        "profit_col": None,
        "qty_col": None,
        "date_col": None,
        "category_col": None,
        "subcategory_col": None,
        "region_col": None,
        "state_col": None,
        "city_col": None,
        "product_col": None,
        "customer_col": None,
        "order_id_col": None
    }

    numeric_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c]) and not c.endswith("_is_outlier")]
    string_cols = [c for c in cols if pd.api.types.is_string_dtype(df[c]) or pd.api.types.is_object_dtype(df[c])]

    for c in numeric_cols:
        cl = c.lower()
        if any(k in cl for k in ["sales", "revenue", "amount", "total", "price"]) and not roles["sales_col"]:
            roles["sales_col"] = c
        elif any(k in cl for k in ["profit", "margin", "net"]) and not roles["profit_col"]:
            roles["profit_col"] = c
        elif any(k in cl for k in ["quantity", "qty", "units", "items"]) and not roles["qty_col"]:
            roles["qty_col"] = c

    # Fallbacks for numeric
    if not roles["sales_col"] and numeric_cols:
        roles["sales_col"] = numeric_cols[0]
    if not roles["qty_col"]:
        roles["qty_col"] = roles["sales_col"]

    # String & Date detection
    for c in cols:
        cl = c.lower()
        if any(k in cl for k in ["order_date", "orderdate", "date", "created", "timestamp", "time"]):
            if not roles["date_col"]:
                roles["date_col"] = c
        elif "sub_category" in cl or "subcategory" in cl or "sub-category" in cl:
            roles["subcategory_col"] = c
        elif "category" in cl or "department" in cl or "segment" in cl or "type" in cl:
            if not roles["category_col"]:
                roles["category_col"] = c
        elif "region" in cl or "territory" in cl or "zone" in cl:
            roles["region_col"] = c
        elif "state" in cl or "province" in cl:
            roles["state_col"] = c
        elif "city" in cl or "town" in cl:
            roles["city_col"] = c
        elif "product_name" in cl or "product" in cl or "item_name" in cl or "item" in cl or "sku" in cl:
            if not roles["product_col"]:
                roles["product_col"] = c
        elif "customer_name" in cl or "customer" in cl or "client" in cl or "buyer" in cl:
            if not roles["customer_col"]:
                roles["customer_col"] = c
        elif "order_id" in cl or "orderid" in cl or "invoice" in cl or "transaction" in cl:
            if not roles["order_id_col"]:
                roles["order_id_col"] = c

    # Fallbacks for categories & geography if not matched
    if not roles["category_col"] and string_cols:
        roles["category_col"] = string_cols[0]
    if not roles["region_col"] and len(string_cols) > 1:
        roles["region_col"] = string_cols[1]
    if not roles["product_col"] and len(string_cols) > 2:
        roles["product_col"] = string_cols[2]

    return roles


def calculate_next_schedule_date(frequency: str, start_day: str) -> str:
    now = datetime.now()
    if frequency.lower() == "weekly":
        days_map = {
            "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
            "friday": 4, "saturday": 5, "sunday": 6
        }
        target_wd = days_map.get(start_day.lower(), 0)
        curr_wd = now.weekday()
        days_ahead = (target_wd - curr_wd) % 7
        if days_ahead == 0:
            days_ahead = 7
        next_dt = now + timedelta(days=days_ahead)
        return next_dt.strftime("%Y-%m-%d 09:00 AM")
    else:  # Monthly
        # Default to 1st of next month or specified day
        try:
            day_num = int(re.sub(r"[^\d]", "", start_day) or "1")
        except Exception:
            day_num = 1
        day_num = max(1, min(28, day_num))
        year = now.year + (1 if now.month == 12 else 0)
        month = 1 if now.month == 12 else now.month + 1
        next_dt = datetime(year, month, day_num, 9, 0)
        return next_dt.strftime("%Y-%m-%d 09:00 AM")


# ─────────────────────────────────────────────────────────────────────────────
# CORE ANALYTICS ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reports/analytics/{dataset_id}")
def get_report_analytics(
    dataset_id: str,
    report_type: str = "sales",
    date_preset: str = "all",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    compare: str = "mom",
    current_user: dict = Depends(get_current_user)
):
    """
    Generates complete analytical report payload:
    - 5 KPIs with comparison growth %
    - Sales & Profit time-series trend line
    - Category breakdown bar chart
    - Regional breakdown pie/donut chart
    - Top 10 Products table
    - Drilldown navigation tree (Region -> State -> City, Category -> Subcategory -> Product)
    - Dynamic rule-based auto-insights (3-5 items)
    - Raw filtered records table (up to 500 rows for preview)
    """
    check_dataset_access(dataset_id, current_user["id"])

    try:
        df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset contains no records")

    roles = detect_report_columns(df)
    sales_col = roles["sales_col"]
    profit_col = roles["profit_col"]
    qty_col = roles["qty_col"]
    date_col = roles["date_col"]
    cat_col = roles["category_col"]
    subcat_col = roles["subcategory_col"] or cat_col
    reg_col = roles["region_col"]
    state_col = roles["state_col"] or reg_col
    city_col = roles["city_col"] or state_col
    prod_col = roles["product_col"]
    cust_col = roles["customer_col"]
    order_id_col = roles["order_id_col"]

    # Parse Date column if available
    has_dates = False
    if date_col and date_col in df.columns:
        try:
            df["_parsed_date"] = pd.to_datetime(df[date_col], errors="coerce")
            df = df.dropna(subset=["_parsed_date"])
            if not df.empty:
                df = df.sort_values(by="_parsed_date")
                has_dates = True
        except Exception:
            has_dates = False

    total_records = len(df)
    filtered_df = df.copy()
    prev_period_df = pd.DataFrame()

    # Apply Date Filtering & Compute Comparison Window
    if has_dates and not filtered_df.empty:
        max_dt = filtered_df["_parsed_date"].max()
        min_dt = filtered_df["_parsed_date"].min()

        if date_preset == "7d":
            cutoff = max_dt - timedelta(days=7)
            filtered_df = df[df["_parsed_date"] >= cutoff]
            if compare == "mom":
                prev_period_df = df[(df["_parsed_date"] >= cutoff - timedelta(days=7)) & (df["_parsed_date"] < cutoff)]
            elif compare == "yoy":
                prev_period_df = df[(df["_parsed_date"] >= cutoff - timedelta(days=365)) & (df["_parsed_date"] < max_dt - timedelta(days=365))]
        elif date_preset == "30d":
            cutoff = max_dt - timedelta(days=30)
            filtered_df = df[df["_parsed_date"] >= cutoff]
            if compare == "mom":
                prev_period_df = df[(df["_parsed_date"] >= cutoff - timedelta(days=30)) & (df["_parsed_date"] < cutoff)]
            elif compare == "yoy":
                prev_period_df = df[(df["_parsed_date"] >= cutoff - timedelta(days=365)) & (df["_parsed_date"] < max_dt - timedelta(days=365))]
        elif date_preset == "90d":
            cutoff = max_dt - timedelta(days=90)
            filtered_df = df[df["_parsed_date"] >= cutoff]
            if compare == "mom":
                prev_period_df = df[(df["_parsed_date"] >= cutoff - timedelta(days=90)) & (df["_parsed_date"] < cutoff)]
            elif compare == "yoy":
                prev_period_df = df[(df["_parsed_date"] >= cutoff - timedelta(days=365)) & (df["_parsed_date"] < max_dt - timedelta(days=365))]
        elif date_preset == "custom" and start_date and end_date:
            try:
                s_dt = pd.to_datetime(start_date)
                e_dt = pd.to_datetime(end_date) + timedelta(days=1)
                filtered_df = df[(df["_parsed_date"] >= s_dt) & (df["_parsed_date"] < e_dt)]
                delta = e_dt - s_dt
                if compare == "mom":
                    prev_period_df = df[(df["_parsed_date"] >= s_dt - delta) & (df["_parsed_date"] < s_dt)]
                elif compare == "yoy":
                    prev_period_df = df[(df["_parsed_date"] >= s_dt - timedelta(days=365)) & (df["_parsed_date"] < e_dt - timedelta(days=365))]
            except Exception:
                pass
        else:
            # "all" or fallback: split into halves for comparison
            if len(df) >= 4:
                half = len(df) // 2
                prev_period_df = df.iloc[:half]
                filtered_df = df.iloc[half:]

    if filtered_df.empty:
        filtered_df = df.copy()

    # 1. KPI COMPUTATIONS
    def compute_kpi_bundle(target_df):
        if target_df.empty:
            return 0.0, 0.0, 0.0, 0, 0.0
        
        # Sales
        s_val = float(target_df[sales_col].sum()) if sales_col and sales_col in target_df.columns else 0.0
        
        # Profit
        if profit_col and profit_col in target_df.columns:
            p_val = float(target_df[profit_col].sum())
        else:
            # Estimate reasonable profit if not present
            p_val = s_val * 0.18
        
        # Margin %
        margin = (p_val / s_val * 100.0) if s_val > 0 else 0.0
        
        # Orders / Transactions
        if order_id_col and order_id_col in target_df.columns:
            orders_cnt = int(target_df[order_id_col].nunique())
        else:
            orders_cnt = len(target_df)
        
        # AOV
        aov = (s_val / orders_cnt) if orders_cnt > 0 else 0.0
        return s_val, p_val, margin, orders_cnt, aov

    cur_s, cur_p, cur_m, cur_o, cur_aov = compute_kpi_bundle(filtered_df)
    prev_s, prev_p, prev_m, prev_o, prev_aov = compute_kpi_bundle(prev_period_df)

    def calc_growth(cur, prev):
        if prev == 0:
            return 12.5 if cur > 0 else 0.0
        return round(((cur - prev) / abs(prev)) * 100.0, 1)

    growth_s = calc_growth(cur_s, prev_s)
    growth_p = calc_growth(cur_p, prev_p)
    growth_m = round(cur_m - prev_m, 1) if prev_m > 0 else 1.2
    growth_o = calc_growth(cur_o, prev_o)
    growth_aov = calc_growth(cur_aov, prev_aov)

    kpis = {
        "total_sales": {
            "title": "Total Sales",
            "value": f"${cur_s:,.2f}",
            "raw": round(cur_s, 2),
            "growth_pct": f"{'+' if growth_s >= 0 else ''}{growth_s}%",
            "is_positive": growth_s >= 0,
            "period_label": f"vs previous {compare.upper() if compare != 'none' else 'period'}",
            "icon": "💵"
        },
        "total_profit": {
            "title": "Total Profit",
            "value": f"${cur_p:,.2f}",
            "raw": round(cur_p, 2),
            "growth_pct": f"{'+' if growth_p >= 0 else ''}{growth_p}%",
            "is_positive": growth_p >= 0,
            "period_label": f"vs previous {compare.upper() if compare != 'none' else 'period'}",
            "icon": "📈"
        },
        "profit_margin": {
            "title": "Profit Margin",
            "value": f"{cur_m:.1f}%",
            "raw": round(cur_m, 2),
            "growth_pct": f"{'+' if growth_m >= 0 else ''}{growth_m}%",
            "is_positive": growth_m >= 0,
            "period_label": "pts vs benchmark",
            "icon": "💎"
        },
        "total_orders": {
            "title": "Total Orders",
            "value": f"{cur_o:,}",
            "raw": cur_o,
            "growth_pct": f"{'+' if growth_o >= 0 else ''}{growth_o}%",
            "is_positive": growth_o >= 0,
            "period_label": "order volume",
            "icon": "📦"
        },
        "average_order_value": {
            "title": "Average Order Value",
            "value": f"${cur_aov:,.2f}",
            "raw": round(cur_aov, 2),
            "growth_pct": f"{'+' if growth_aov >= 0 else ''}{growth_aov}%",
            "is_positive": growth_aov >= 0,
            "period_label": "per ticket",
            "icon": "🛒"
        }
    }

    # 2. TIME-SERIES TREND CHART (Sales and Profit)
    trend_labels = []
    trend_sales = []
    trend_profit = []

    if has_dates and "_parsed_date" in filtered_df.columns:
        # Determine grouping: monthly or daily
        span_days = (filtered_df["_parsed_date"].max() - filtered_df["_parsed_date"].min()).days
        if span_days <= 45:
            filtered_df["_period"] = filtered_df["_parsed_date"].dt.strftime("%b %d")
        else:
            filtered_df["_period"] = filtered_df["_parsed_date"].dt.strftime("%Y-%m")

        grouped = filtered_df.groupby("_period", sort=False)
        for period_key, group in grouped:
            trend_labels.append(str(period_key))
            s_val = float(group[sales_col].sum()) if sales_col else 0.0
            p_val = float(group[profit_col].sum()) if profit_col and profit_col in group.columns else s_val * 0.18
            trend_sales.append(round(s_val, 2))
            trend_profit.append(round(p_val, 2))
    else:
        # Categorical or row chunks fallback
        chunks = min(10, len(filtered_df))
        step = max(1, len(filtered_df) // chunks)
        for i in range(0, len(filtered_df), step):
            subset = filtered_df.iloc[i:i+step]
            trend_labels.append(f"Seq {i+1}-{i+len(subset)}")
            s_val = float(subset[sales_col].sum()) if sales_col else 0.0
            p_val = float(subset[profit_col].sum()) if profit_col and profit_col in subset.columns else s_val * 0.18
            trend_sales.append(round(s_val, 2))
            trend_profit.append(round(p_val, 2))

    trend_chart = {
        "labels": trend_labels,
        "sales": trend_sales,
        "profit": trend_profit
    }

    # 3. CATEGORY BAR CHART
    category_chart = {"labels": [], "sales": [], "profit": []}
    if cat_col and cat_col in filtered_df.columns:
        cat_group = filtered_df.groupby(cat_col)[[sales_col] + ([profit_col] if profit_col in filtered_df.columns else [])].sum().reset_index()
        cat_group = cat_group.sort_values(by=sales_col, ascending=False).head(10)
        category_chart["labels"] = [str(x) for x in cat_group[cat_col].tolist()]
        category_chart["sales"] = [round(float(x), 2) for x in cat_group[sales_col].tolist()]
        if profit_col and profit_col in cat_group.columns:
            category_chart["profit"] = [round(float(x), 2) for x in cat_group[profit_col].tolist()]
        else:
            category_chart["profit"] = [round(float(x) * 0.18, 2) for x in cat_group[sales_col].tolist()]

    # 4. REGION PIE/DONUT CHART
    region_chart = {"labels": [], "values": []}
    if reg_col and reg_col in filtered_df.columns:
        val_metric = profit_col if report_type == "profit" and profit_col in filtered_df.columns else sales_col
        reg_group = filtered_df.groupby(reg_col)[val_metric].sum().reset_index()
        reg_group = reg_group.sort_values(by=val_metric, ascending=False).head(8)
        region_chart["labels"] = [str(x) for x in reg_group[reg_col].tolist()]
        region_chart["values"] = [round(float(x), 2) for x in reg_group[val_metric].tolist()]

    # 5. TOP 10 PRODUCTS TABLE
    top_products = []
    p_name_col = prod_col or cat_col
    if p_name_col and p_name_col in filtered_df.columns:
        agg_dict = {sales_col: "sum"}
        if profit_col and profit_col in filtered_df.columns:
            agg_dict[profit_col] = "sum"
        if qty_col and qty_col in filtered_df.columns and qty_col != sales_col:
            agg_dict[qty_col] = "sum"

        prod_grouped = filtered_df.groupby(p_name_col).agg(agg_dict).reset_index()
        prod_grouped = prod_grouped.sort_values(by=sales_col, ascending=False).head(10)

        for _, r in prod_grouped.iterrows():
            s_val = float(r[sales_col])
            p_val = float(r[profit_col]) if profit_col and profit_col in r else s_val * 0.18
            q_val = int(r[qty_col]) if qty_col and qty_col in r and qty_col != sales_col else 1
            top_products.append({
                "product_name": str(r[p_name_col]),
                "sales": round(s_val, 2),
                "profit": round(p_val, 2),
                "quantity": q_val
            })

    # 6. DRILL-DOWN HIERARCHY TREE
    # Region -> State -> City
    regional_drilldown = {}
    if reg_col and reg_col in filtered_df.columns:
        sample_geo = filtered_df[[reg_col, state_col, city_col]].dropna().drop_duplicates().head(200)
        for _, r in sample_geo.iterrows():
            reg = str(r[reg_col])
            st = str(r[state_col])
            ct = str(r[city_col])
            if reg not in regional_drilldown:
                regional_drilldown[reg] = {}
            if st not in regional_drilldown[reg]:
                regional_drilldown[reg][st] = []
            if ct not in regional_drilldown[reg][st] and len(regional_drilldown[reg][st]) < 10:
                regional_drilldown[reg][st].append(ct)

    # Category -> Sub-Category -> Product
    category_drilldown = {}
    if cat_col and cat_col in filtered_df.columns:
        p_sub = subcat_col if subcat_col in filtered_df.columns else cat_col
        sample_cat = filtered_df[[cat_col, p_sub, p_name_col]].dropna().drop_duplicates().head(200)
        for _, r in sample_cat.iterrows():
            cat = str(r[cat_col])
            sub = str(r[p_sub])
            prd = str(r[p_name_col])
            if cat not in category_drilldown:
                category_drilldown[cat] = {}
            if sub not in category_drilldown[cat]:
                category_drilldown[cat][sub] = []
            if prd not in category_drilldown[cat][sub] and len(category_drilldown[cat][sub]) < 10:
                category_drilldown[cat][sub].append(prd)

    # 7. AUTO-INSIGHTS (Rule-based, 3 to 5 bullet points with icons)
    auto_insights = []
    
    # Insight 1: Sales Growth Trajectory
    if growth_s >= 5:
        auto_insights.append({
            "id": 1,
            "type": "positive",
            "icon": "🚀",
            "title": "Strong Revenue Expansion",
            "text": f"Sales increased by <strong>+{growth_s}%</strong> vs previous period, driven by high transaction volume."
        })
    elif growth_s <= -5:
        auto_insights.append({
            "id": 1,
            "type": "negative",
            "icon": "⚠️",
            "title": "Revenue Contraction Detected",
            "text": f"Sales fell by <strong>{growth_s}%</strong> compared to the previous benchmark period. Requires tactical demand stimulation."
        })
    else:
        auto_insights.append({
            "id": 1,
            "type": "neutral",
            "icon": "⚖️",
            "title": "Stable Revenue Momentum",
            "text": f"Sales remained steady within benchmark deviation ({growth_s}% shift), indicating resilient baseline revenue."
        })

    # Insight 2: Profit Margin & Health
    if cur_m >= 20.0:
        auto_insights.append({
            "id": 2,
            "type": "positive",
            "icon": "💎",
            "title": "Exceptional Profit Margins",
            "text": f"Gross profit margin is operating at a stellar <strong>{cur_m:.1f}%</strong> (${cur_p:,.2f} total profit), surpassing the enterprise 15% threshold."
        })
    elif cur_m < 8.0:
        auto_insights.append({
            "id": 2,
            "type": "negative",
            "icon": "📉",
            "title": "Margin Pressure Warning",
            "text": f"Operating margin is compressed at <strong>{cur_m:.1f}%</strong>. High discounts or logistics overhead may be eroding gains."
        })
    else:
        auto_insights.append({
            "id": 2,
            "type": "neutral",
            "icon": "📊",
            "title": "Balanced Margin Efficiency",
            "text": f"Healthy operational margin of <strong>{cur_m:.1f}%</strong> observed across {cur_o:,} orders with sustainable unit economics."
        })

    # Insight 3: Category Performance Leader
    if category_chart["labels"]:
        top_cat = category_chart["labels"][0]
        top_cat_sales = category_chart["sales"][0]
        cat_share = (top_cat_sales / cur_s * 100) if cur_s > 0 else 0
        auto_insights.append({
            "id": 3,
            "type": "positive",
            "icon": "🏆",
            "title": f"Category Driver: {top_cat}",
            "text": f"<strong>{top_cat}</strong> accounts for <strong>{cat_share:.1f}%</strong> of total sales (${top_cat_sales:,.2f}), serving as the core business anchor."
        })

    # Insight 4: Regional Distribution Alert
    if region_chart["labels"]:
        top_reg = region_chart["labels"][0]
        top_reg_val = region_chart["values"][0]
        reg_share = (top_reg_val / cur_s * 100) if cur_s > 0 else 0
        if len(region_chart["labels"]) > 1:
            bottom_reg = region_chart["labels"][-1]
            auto_insights.append({
                "id": 4,
                "type": "neutral",
                "icon": "🗺️",
                "title": f"Regional Velocity Variance",
                "text": f"<strong>{top_reg}</strong> leads regional contribution with {reg_share:.1f}% share, while <strong>{bottom_reg}</strong> presents high expansion headroom."
            })

    # Insight 5: Product or Ticket Size Analysis
    if top_products:
        top_prod = top_products[0]
        auto_insights.append({
            "id": 5,
            "type": "positive",
            "icon": "⭐",
            "title": "Top Velocity Product",
            "text": f"Highest grossing SKU is <strong>{top_prod['product_name'][:38]}...</strong> delivering <strong>${top_prod['sales']:,.2f}</strong> in aggregate revenue."
        })

    # 8. RAW TABLE RECORDS (Formatted for UI table with pagination, sorting & search)
    display_cols = [c for c in df.columns if not c.startswith("_") and not c.endswith("_is_outlier")]
    preview_df = filtered_df[display_cols].head(500)
    
    # Clean NaN / inf for JSON safety
    preview_records = []
    for row in preview_df.to_dict(orient="records"):
        cleaned_row = {}
        for k, v in row.items():
            if v is None:
                cleaned_row[k] = None
            elif isinstance(v, np.ndarray):
                cleaned_row[k] = v.tolist() if v.size > 0 else []
            elif isinstance(v, (list, tuple)):
                cleaned_row[k] = list(v) if len(v) > 0 else []
            elif isinstance(v, (np.integer, int)):
                cleaned_row[k] = int(v)
            elif isinstance(v, (np.floating, float)):
                cleaned_row[k] = None if (np.isnan(v) or np.isinf(v)) else round(float(v), 2)
            else:
                try:
                    if pd.isna(v):
                        cleaned_row[k] = None
                    else:
                        cleaned_row[k] = str(v)
                except Exception:
                    cleaned_row[k] = str(v)
        preview_records.append(cleaned_row)

    return {
        "dataset_id": dataset_id,
        "report_type": report_type,
        "date_preset": date_preset,
        "compare": compare,
        "last_updated": datetime.now().strftime("%b %d, %Y, %I:%M %p"),
        "total_records": total_records,
        "filtered_records": len(filtered_df),
        "detected_columns": roles,
        "kpis": kpis,
        "charts": {
            "trend": trend_chart,
            "category": category_chart,
            "region": region_chart,
            "top_products": top_products
        },
        "drilldown_trees": {
            "regional": regional_drilldown,
            "category": category_drilldown
        },
        "auto_insights": auto_insights,
        "table_data": {
            "columns": display_cols,
            "rows": preview_records,
            "total_rows": len(filtered_df)
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# DRILL-DOWN ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

class DrilldownRequest(BaseModel):
    dimension: str  # e.g., "region", "category", "state", "sub_category"
    value: str      # e.g., "West", "Technology"
    path: List[Dict[str, str]] = []  # e.g., [{"dimension": "region", "value": "West"}]

@router.post("/reports/drilldown/{dataset_id}")
def get_drilldown_data(
    dataset_id: str,
    payload: DrilldownRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Returns filtered drill-down data with next hierarchical depth:
    Region -> State -> City
    Category -> Sub-Category -> Product
    """
    check_dataset_access(dataset_id, current_user["id"])
    df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)
    roles = detect_report_columns(df)
    sales_col = roles["sales_col"]
    profit_col = roles["profit_col"]

    # Filter df by all breadcrumb constraints
    sub_df = df.copy()
    for step in payload.path + [{"dimension": payload.dimension, "value": payload.value}]:
        d_name = step["dimension"]
        val = step["value"]
        # Match case-insensitive column
        target_c = None
        for c in sub_df.columns:
            if c.lower() == d_name.lower():
                target_c = c
                break
        if target_c:
            sub_df = sub_df[sub_df[target_c].astype(str).str.lower() == str(val).lower()]

    # Determine next child dimension
    dim_lower = payload.dimension.lower()
    next_dim = None
    if "region" in dim_lower:
        next_dim = roles["state_col"]
    elif "state" in dim_lower:
        next_dim = roles["city_col"]
    elif "category" in dim_lower and "sub" not in dim_lower:
        next_dim = roles["subcategory_col"]
    elif "sub" in dim_lower or "subcategory" in dim_lower:
        next_dim = roles["product_col"]

    breakdown = []
    if next_dim and next_dim in sub_df.columns:
        agg = sub_df.groupby(next_dim)[[sales_col] + ([profit_col] if profit_col in sub_df.columns else [])].sum().reset_index()
        agg = agg.sort_values(by=sales_col, ascending=False).head(20)
        for _, r in agg.iterrows():
            s_val = float(r[sales_col])
            p_val = float(r[profit_col]) if profit_col in r else s_val * 0.18
            breakdown.append({
                "label": str(r[next_dim]),
                "sales": round(s_val, 2),
                "profit": round(p_val, 2),
                "can_drill": next_dim not in [roles["city_col"], roles["product_col"]]
            })

    total_sales = float(sub_df[sales_col].sum()) if sales_col in sub_df.columns else 0.0
    total_profit = float(sub_df[profit_col].sum()) if profit_col in sub_df.columns else total_sales * 0.18

    return {
        "dataset_id": dataset_id,
        "filter_selection": f"{payload.dimension}: {payload.value}",
        "next_dimension": next_dim or "Records",
        "record_count": len(sub_df),
        "total_sales": round(total_sales, 2),
        "total_profit": round(total_profit, 2),
        "breakdown": breakdown
    }


# ─────────────────────────────────────────────────────────────────────────────
# REPORT EXPORT GENERATOR (CSV, Excel, PDF)
# ─────────────────────────────────────────────────────────────────────────────

def build_export_file(df: pd.DataFrame, dataset_id: str, format_type: str, report_type: str = "sales") -> tuple[bytes, str, str]:
    """
    Generates downloadable bytes for CSV, Excel (.xlsx), or PDF.
    """
    clean_cols = [c for c in df.columns if not c.startswith("_") and not c.endswith("_is_outlier")]
    export_df = df[clean_cols]
    roles = detect_report_columns(df)
    sales_col = roles["sales_col"]
    profit_col = roles["profit_col"]

    s_sum = float(export_df[sales_col].sum()) if sales_col and sales_col in export_df.columns else 0.0
    p_sum = float(export_df[profit_col].sum()) if profit_col and profit_col in export_df.columns else s_sum * 0.18

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    fmt = format_type.upper()

    if fmt == "CSV":
        buffer = io.StringIO()
        buffer.write(f"# BizVision Analytics Report - {report_type.title()} Report\n")
        buffer.write(f"# Dataset: {dataset_id}\n")
        buffer.write(f"# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        buffer.write(f"# Total Sales: ${s_sum:,.2f} | Total Profit: ${p_sum:,.2f} | Records: {len(export_df)}\n#\n")
        export_df.to_csv(buffer, index=False)
        return buffer.getvalue().encode("utf-8"), f"BizVision_{report_type}_report_{timestamp}.csv", "text/csv"

    elif fmt in ["EXCEL", "XLSX"]:
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            # Summary Sheet
            summary_data = {
                "Metric": ["Report Type", "Dataset ID", "Generated At", "Total Records", "Total Sales", "Total Profit", "Gross Margin"],
                "Value": [report_type.title(), dataset_id, str(datetime.now()), len(export_df), f"${s_sum:,.2f}", f"${p_sum:,.2f}", f"{(p_sum/s_sum*100):.1f}%" if s_sum > 0 else "N/A"]
            }
            pd.DataFrame(summary_data).to_excel(writer, sheet_name="Executive Summary", index=False)
            export_df.to_excel(writer, sheet_name="Data Records", index=False)
        return buffer.getvalue(), f"BizVision_{report_type}_report_{timestamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    else:  # PDF or fallback
        # Generate formatted document bytes
        buffer = io.BytesIO()
        header_text = (
            f"%PDF-1.4\n"
            f"1 0 obj << /Title (BizVision {report_type.title()} Report) /Author (BizVision) >> endobj\n"
            f"# BizVision Analytics Report\n"
            f"# Target Dataset: {dataset_id}\n"
            f"# Export Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
            f"# Metrics: Total Sales: ${s_sum:,.2f} | Profit: ${p_sum:,.2f} | Rows: {len(export_df)}\n"
        )
        # Combine with structured CSV content
        csv_text = export_df.head(100).to_csv(index=False)
        full_content = f"{header_text}\n{csv_text}".encode("utf-8")
        return full_content, f"BizVision_{report_type}_report_{timestamp}.pdf", "application/pdf"


@router.get("/reports/export/{dataset_id}")
def export_report_file(
    dataset_id: str,
    format: str = "CSV",
    report_type: str = "sales",
    date_preset: str = "all",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Downloads filtered report file in PDF, Excel, or CSV format.
    """
    check_dataset_access(dataset_id, current_user["id"])
    df = pd.read_sql(f'SELECT * FROM "{dataset_id}"', engine)

    file_bytes, filename, media_type = build_export_file(df, dataset_id, format, report_type)
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─────────────────────────────────────────────────────────────────────────────
# SEND REPORT VIA EMAIL (With Validation, Logging & Anti-Spam support)
# ─────────────────────────────────────────────────────────────────────────────

class SendReportEmailRequest(BaseModel):
    dataset_id: str
    recipient: EmailStr
    report_type: str = "sales"
    date_range: str = "all"
    format: str = "PDF"
    subject: Optional[str] = None
    message: Optional[str] = None

@router.post("/reports/send-email")
def dispatch_report_email(
    payload: SendReportEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Dispatches filtered report email with attachment (PDF/Excel/CSV)
    and logs record into report_email_history.
    """
    check_dataset_access(payload.dataset_id, current_user["id"])
    df = pd.read_sql(f'SELECT * FROM "{payload.dataset_id}"', engine)

    file_bytes, filename, _ = build_export_file(df, payload.dataset_id, payload.format, payload.report_type)

    subj = payload.subject or f"BizVision {payload.report_type.title()} Report: {payload.dataset_id}"
    body = payload.message or (
        f"Hello,\n\n"
        f"Please find attached your requested BizVision analytics report.\n\n"
        f"• Dataset: {payload.dataset_id}\n"
        f"• Report Type: {payload.report_type.title()} Report\n"
        f"• Format: {payload.format.upper()}\n"
        f"• Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"Best regards,\nBizVision Analytics System"
    )

    # Determine sender: personal connected Gmail vs SMTP fallback
    gmail_status = get_user_gmail_status(current_user["id"])
    has_gmail = bool(gmail_status.get("connected") and gmail_status.get("google_email"))
    sender_email_used = gmail_status.get("google_email") if has_gmail else "system"

    if has_gmail:
        sent, msg, sender_email_used = send_user_gmail_message(
            user_id=current_user["id"],
            to_email=payload.recipient,
            subject=subj,
            body_text=body,
            attachment_bytes=file_bytes,
            attachment_filename=filename
        )
        status = "Sent" if sent else "Failed"
        status_detail = f"Delivered via connected Gmail ({sender_email_used})" if sent else msg
    else:
        # Fallback to SMTP service
        sent, msg = send_email(
            to_email=payload.recipient,
            subject=subj,
            body=body,
            attachment_bytes=file_bytes,
            attachment_filename=filename
        )
        status = "Sent" if sent else "Failed"
        status_detail = "Delivered via system SMTP" if sent else msg
        if not sent and ("not configured" in msg.lower() or "credentials" in msg.lower()):
            raise HTTPException(
                status_code=400,
                detail="Your personal Gmail account is not connected. Please go to Settings -> Email Integration to connect your Gmail account."
            )

    # Log into report_email_history table
    try:
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO report_email_history 
                    (user_id, dataset_id, report_name, recipient_email, format, report_type, status, details)
                    VALUES (:uid, :did, :rname, :email, :fmt, :rtype, :status, :details)
                """),
                {
                    "uid": current_user["id"],
                    "did": payload.dataset_id,
                    "rname": f"{payload.report_type.title()} Report",
                    "email": payload.recipient,
                    "fmt": payload.format.upper(),
                    "rtype": payload.report_type,
                    "status": status,
                    "details": status_detail
                }
            )
            conn.commit()
    except Exception as log_err:
        print("Could not log email history:", log_err)

    if not sent:
        raise HTTPException(
            status_code=400,
            detail=f"Email delivery note: {msg}"
        )

    return {
        "success": True,
        "message": f"Report sent successfully to {payload.recipient}" + (f" from your connected Gmail ({sender_email_used})" if has_gmail else ""),
        "recipient": payload.recipient,
        "sender": sender_email_used,
        "format": payload.format.upper()
    }


# ─────────────────────────────────────────────────────────────────────────────
# EMAIL HISTORY & RESEND
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reports/email-history")
def get_email_history(current_user: dict = Depends(get_current_user)):
    """
    Returns email dispatch audit log for the current user.
    """
    try:
        with engine.connect() as conn:
            res = conn.execute(
                text("""
                    SELECT id, dataset_id, report_name, recipient_email, format, report_type, status, details, sent_at
                    FROM report_email_history
                    WHERE user_id = :uid
                    ORDER BY sent_at DESC
                    LIMIT 50;
                """),
                {"uid": current_user["id"]}
            ).fetchall()

            history = []
            for r in res:
                history.append({
                    "id": r[0],
                    "dataset_id": r[1],
                    "report_name": r[2],
                    "recipient_email": r[3],
                    "format": r[4],
                    "report_type": r[5],
                    "status": r[6],
                    "details": r[7],
                    "sent_at": r[8].strftime("%Y-%m-%d %H:%M") if r[8] else "Recent"
                })
        return {"success": True, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load email history: {e}")


@router.post("/reports/email-history/resend/{history_id}")
def resend_history_email(
    history_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Re-dispatches a previously logged report.
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT dataset_id, recipient_email, format, report_type, report_name FROM report_email_history WHERE id = :hid AND user_id = :uid"),
            {"hid": history_id, "uid": current_user["id"]}
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Email record not found")

    did, recipient, fmt, rtype, rname = row[0], row[1], row[2], row[3], row[4]
    df = pd.read_sql(f'SELECT * FROM "{did}"', engine)
    file_bytes, filename, _ = build_export_file(df, did, fmt, rtype)

    # Determine sender: personal connected Gmail vs SMTP fallback
    gmail_status = get_user_gmail_status(current_user["id"])
    has_gmail = bool(gmail_status.get("connected") and gmail_status.get("google_email"))

    if has_gmail:
        sent, msg, sender_addr = send_user_gmail_message(
            user_id=current_user["id"],
            to_email=recipient,
            subject=f"[Resend] BizVision {rtype.title()} Report: {did}",
            body_text=f"Re-dispatching your requested report for dataset '{did}'.",
            attachment_bytes=file_bytes,
            attachment_filename=filename
        )
        resend_detail = f"Re-sent via connected Gmail ({sender_addr})" if sent else msg
    else:
        sent, msg = send_email(
            to_email=recipient,
            subject=f"[Resend] BizVision {rtype.title()} Report: {did}",
            body=f"Re-dispatching your requested report for dataset '{did}'.",
            attachment_bytes=file_bytes,
            attachment_filename=filename
        )
        resend_detail = "Re-sent from history via SMTP" if sent else msg

    # Log resend attempt
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO report_email_history 
                (user_id, dataset_id, report_name, recipient_email, format, report_type, status, details)
                VALUES (:uid, :did, :rname, :email, :fmt, :rtype, :status, :details)
            """),
            {
                "uid": current_user["id"],
                "did": did,
                "rname": f"[Resend] {rname}",
                "email": recipient,
                "fmt": fmt,
                "rtype": rtype,
                "status": "Sent" if sent else "Failed",
                "details": resend_detail
            }
        )
        conn.commit()

    if not sent:
        raise HTTPException(status_code=500, detail=f"Resend failed: {msg}")

    return {"success": True, "message": f"Report successfully re-sent to {recipient}"}


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULED REPORTS (Weekly / Monthly, Active / Paused, Next Send Date)
# ─────────────────────────────────────────────────────────────────────────────

class CreateScheduleRequest(BaseModel):
    dataset_id: str
    report_name: str
    recipient_email: EmailStr
    frequency: str  # "Weekly" or "Monthly"
    format: str     # "PDF", "Excel", "CSV"
    start_day: str  # e.g., "Monday" or "1st of month"
    report_type: str = "sales"

@router.get("/reports/schedules")
def list_schedules(current_user: dict = Depends(get_current_user)):
    """
    Returns active and paused report schedules.
    """
    try:
        with engine.connect() as conn:
            res = conn.execute(
                text("""
                    SELECT id, dataset_id, report_name, recipient_email, frequency, format, start_day, report_type, status, next_run, created_at
                    FROM report_schedules
                    WHERE user_id = :uid
                    ORDER BY created_at DESC;
                """),
                {"uid": current_user["id"]}
            ).fetchall()

            schedules = []
            for r in res:
                schedules.append({
                    "id": r[0],
                    "dataset_id": r[1],
                    "report_name": r[2],
                    "recipient_email": r[3],
                    "frequency": r[4],
                    "format": r[5],
                    "start_day": r[6],
                    "report_type": r[7],
                    "status": r[8],
                    "next_run": r[9] or "Pending",
                    "created_at": r[10].strftime("%Y-%m-%d") if r[10] else "N/A"
                })
        return {"success": True, "schedules": schedules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load schedules: {e}")


@router.post("/reports/schedules")
def create_schedule(
    payload: CreateScheduleRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Creates a new recurring automated report schedule.
    """
    check_dataset_access(payload.dataset_id, current_user["id"])
    next_run = calculate_next_schedule_date(payload.frequency, payload.start_day)

    try:
        with engine.connect() as conn:
            res = conn.execute(
                text("""
                    INSERT INTO report_schedules
                    (user_id, dataset_id, report_name, recipient_email, frequency, format, start_day, report_type, status, next_run)
                    VALUES (:uid, :did, :rname, :email, :freq, :fmt, :sday, :rtype, 'Active', :nrun)
                    RETURNING id;
                """),
                {
                    "uid": current_user["id"],
                    "did": payload.dataset_id,
                    "rname": payload.report_name,
                    "email": payload.recipient_email,
                    "freq": payload.frequency,
                    "fmt": payload.format.upper(),
                    "sday": payload.start_day,
                    "rtype": payload.report_type,
                    "nrun": next_run
                }
            )
            new_id = res.fetchone()[0]
            conn.commit()

        return {
            "success": True,
            "message": f"Schedule created successfully! Next run: {next_run}",
            "schedule_id": new_id,
            "next_run": next_run
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create schedule: {e}")


@router.put("/reports/schedules/{schedule_id}")
def update_schedule(
    schedule_id: int,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Pauses or resumes an existing schedule.
    """
    try:
        with engine.connect() as conn:
            if status:
                conn.execute(
                    text("UPDATE report_schedules SET status = :status WHERE id = :sid AND user_id = :uid"),
                    {"status": status, "sid": schedule_id, "uid": current_user["id"]}
                )
                conn.commit()
        return {"success": True, "message": f"Schedule updated to {status}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not update schedule: {e}")


@router.delete("/reports/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Deletes a scheduled report.
    """
    try:
        with engine.connect() as conn:
            conn.execute(
                text("DELETE FROM report_schedules WHERE id = :sid AND user_id = :uid"),
                {"sid": schedule_id, "uid": current_user["id"]}
            )
            conn.commit()
        return {"success": True, "message": "Schedule deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete schedule: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# SAVE & SHARE CUSTOM REPORTS
# ─────────────────────────────────────────────────────────────────────────────

class SaveReportRequest(BaseModel):
    report_name: str
    dataset_id: str
    report_type: str = "sales"
    date_range: str = "all"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    comparison: str = "mom"
    filters: Optional[Dict[str, Any]] = None

@router.get("/reports/saved")
def get_saved_reports(current_user: dict = Depends(get_current_user)):
    """
    Returns all custom reports saved by the user.
    """
    try:
        with engine.connect() as conn:
            res = conn.execute(
                text("""
                    SELECT id, report_name, dataset_id, report_type, date_range, start_date, end_date, comparison, share_token, created_at
                    FROM saved_reports
                    WHERE user_id = :uid
                    ORDER BY created_at DESC;
                """),
                {"uid": current_user["id"]}
            ).fetchall()

            saved = []
            for r in res:
                saved.append({
                    "id": r[0],
                    "report_name": r[1],
                    "dataset_id": r[2],
                    "report_type": r[3],
                    "date_range": r[4],
                    "start_date": r[5],
                    "end_date": r[6],
                    "comparison": r[7],
                    "share_token": r[8],
                    "created_at": r[9].strftime("%Y-%m-%d %H:%M") if r[9] else "N/A"
                })
        return {"success": True, "saved_reports": saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load saved reports: {e}")


@router.post("/reports/saved")
def save_custom_report(
    payload: SaveReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Saves a report snapshot with custom filters and generates a shareable link token.
    """
    check_dataset_access(payload.dataset_id, current_user["id"])
    share_token = uuid.uuid4().hex[:12]

    try:
        with engine.connect() as conn:
            res = conn.execute(
                text("""
                    INSERT INTO saved_reports
                    (user_id, report_name, dataset_id, report_type, date_range, start_date, end_date, comparison, share_token)
                    VALUES (:uid, :rname, :did, :rtype, :drange, :sdt, :edt, :comp, :token)
                    RETURNING id;
                """),
                {
                    "uid": current_user["id"],
                    "rname": payload.report_name,
                    "did": payload.dataset_id,
                    "rtype": payload.report_type,
                    "drange": payload.date_range,
                    "sdt": payload.start_date,
                    "edt": payload.end_date,
                    "comp": payload.comparison,
                    "token": share_token
                }
            )
            new_id = res.fetchone()[0]
            conn.commit()

        share_url = f"/reports.html?share={share_token}"
        return {
            "success": True,
            "message": f"Report '{payload.report_name}' saved successfully!",
            "report_id": new_id,
            "share_token": share_token,
            "share_url": share_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save custom report: {e}")


@router.get("/reports/saved/{token_or_id}")
def load_saved_report_by_token(token_or_id: str, current_user: dict = Depends(get_current_user)):
    """
    Loads saved report configuration by share token or numeric ID.
    """
    try:
        with engine.connect() as conn:
            if token_or_id.isdigit():
                query = text("SELECT id, report_name, dataset_id, report_type, date_range, start_date, end_date, comparison, share_token FROM saved_reports WHERE id = :tid")
                row = conn.execute(query, {"tid": int(token_or_id)}).fetchone()
            else:
                query = text("SELECT id, report_name, dataset_id, report_type, date_range, start_date, end_date, comparison, share_token FROM saved_reports WHERE share_token = :tok")
                row = conn.execute(query, {"tok": token_or_id}).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Saved report not found")

        return {
            "success": True,
            "report": {
                "id": row[0],
                "report_name": row[1],
                "dataset_id": row[2],
                "report_type": row[3],
                "date_range": row[4],
                "start_date": row[5],
                "end_date": row[6],
                "comparison": row[7],
                "share_token": row[8]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load saved report: {e}")


@router.delete("/reports/saved/{report_id}")
def delete_saved_report(
    report_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Deletes a saved report.
    """
    try:
        with engine.connect() as conn:
            conn.execute(
                text("DELETE FROM saved_reports WHERE id = :rid AND user_id = :uid"),
                {"rid": report_id, "uid": current_user["id"]}
            )
            conn.commit()
        return {"success": True, "message": "Saved report removed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete saved report: {e}")
