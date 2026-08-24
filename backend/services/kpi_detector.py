import pandas as pd

# keyword patterns for each business concept
# ye "hardcoded column names" nahi hain — ye common naming patterns hain
# jo bahut saare real-world datasets follow karte hain
KEYWORD_MAP = {
    "revenue": ["revenue", "sales", "amount", "income", "price", "total"],
    "profit": ["profit", "margin", "net_income"],
    "cost": ["cost", "expense", "expenditure"],
    "quantity": ["quantity", "qty", "units", "count", "orders"],
    "customer_id": ["customer_id", "client_id", "user_id", "cust_id"],
    "date": ["date", "time", "month", "year", "timestamp", "period"],
    "category": ["category", "type", "segment", "region", "product"]
}


def match_keywords(column_name: str, keywords: list) -> bool:
    """Column naam mein koi bhi keyword partial match ho to True"""
    col_lower = column_name.lower()
    return any(keyword in col_lower for keyword in keywords)


def detect_column_roles(df: pd.DataFrame) -> dict:
    """
    Har column ko ek ya zyada 'roles' assign karta hai
    (e.g. 'total_sales' -> role 'revenue', kyunki naam match + numeric type)
    """
    roles = {
        "revenue_columns": [],
        "profit_columns": [],
        "cost_columns": [],
        "quantity_columns": [],
        "customer_id_columns": [],
        "date_columns": [],
        "category_columns": []
    }

    for col in df.columns:
        if col.endswith("_is_outlier"):  # cleaning.py ke flag columns skip karo
            continue

        is_numeric = pd.api.types.is_numeric_dtype(df[col])
        is_datetime = pd.api.types.is_datetime64_any_dtype(df[col])
        is_text = pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col])

        # revenue-type: naam match + numeric hona chahiye
        if is_numeric and match_keywords(col, KEYWORD_MAP["revenue"]):
            roles["revenue_columns"].append(col)
        if is_numeric and match_keywords(col, KEYWORD_MAP["profit"]):
            roles["profit_columns"].append(col)
        if is_numeric and match_keywords(col, KEYWORD_MAP["cost"]):
            roles["cost_columns"].append(col)
        if is_numeric and match_keywords(col, KEYWORD_MAP["quantity"]):
            roles["quantity_columns"].append(col)

        # date: naam match YA already datetime type hai
        if is_datetime or match_keywords(col, KEYWORD_MAP["date"]):
            roles["date_columns"].append(col)

        # customer id: naam match hona kaafi hai (numeric ya text dono ho sakta hai)
        if match_keywords(col, KEYWORD_MAP["customer_id"]):
            roles["customer_id_columns"].append(col)

        # category: text column + naam match
        if is_text and match_keywords(col, KEYWORD_MAP["category"]):
            roles["category_columns"].append(col)

    return roles


def generate_kpi_list(df: pd.DataFrame) -> dict:
    """
    Detected columns ke basis pe konse KPIs calculate kiye ja sakte hain,
    ye decide karta hai. Fallback: agar zaroori column nahi mila,
    us KPI ko 'available: false' mark karke reason batao.
    """
    roles = detect_column_roles(df)
    kpis = []

    # --- Total Revenue ---
    if roles["revenue_columns"]:
        col = roles["revenue_columns"][0]
        kpis.append({
            "kpi": "total_revenue",
            "available": True,
            "source_column": col,
            "value": round(float(df[col].sum()), 2)
        })
    else:
        kpis.append({
            "kpi": "total_revenue",
            "available": False,
            "reason": "No revenue/sales/amount type numeric column found"
        })

    # --- Average Order Value ---
    if roles["revenue_columns"] and roles["quantity_columns"]:
        rev_col = roles["revenue_columns"][0]
        qty_col = roles["quantity_columns"][0]
        total_qty = df[qty_col].sum()
        avg_order_value = df[rev_col].sum() / total_qty if total_qty != 0 else 0
        kpis.append({
            "kpi": "average_order_value",
            "available": True,
            "source_columns": [rev_col, qty_col],
            "value": round(float(avg_order_value), 2)
        })
    else:
        kpis.append({
            "kpi": "average_order_value",
            "available": False,
            "reason": "Requires both a revenue column and a quantity column"
        })

    # --- Profit Margin ---
    if roles["profit_columns"] and roles["revenue_columns"]:
        profit_col = roles["profit_columns"][0]
        rev_col = roles["revenue_columns"][0]
        total_rev = df[rev_col].sum()
        margin = (df[profit_col].sum() / total_rev * 100) if total_rev != 0 else 0
        kpis.append({
            "kpi": "profit_margin_percent",
            "available": True,
            "source_columns": [profit_col, rev_col],
            "value": round(float(margin), 2)
        })
    else:
        kpis.append({
            "kpi": "profit_margin_percent",
            "available": False,
            "reason": "Requires both a profit column and a revenue column"
        })

    # --- Time-based trend availability ---
    if roles["date_columns"] and roles["revenue_columns"]:
        kpis.append({
            "kpi": "revenue_trend_over_time",
            "available": True,
            "source_columns": [roles["date_columns"][0], roles["revenue_columns"][0]]
        })
    else:
        kpis.append({
            "kpi": "revenue_trend_over_time",
            "available": False,
            "reason": "Requires both a date column and a revenue column"
        })

    # --- Customer-based analysis (churn/retention potential) ---
    if roles["customer_id_columns"]:
        col = roles["customer_id_columns"][0]
        unique_customers = df[col].nunique()
        kpis.append({
            "kpi": "unique_customers",
            "available": True,
            "source_column": col,
            "value": int(unique_customers)
        })
        kpis.append({
            "kpi": "churn_retention_analysis",
            "available": True if roles["date_columns"] else False,
            "reason": None if roles["date_columns"] else "Customer ID found, but no date column to track repeat visits"
        })
    else:
        kpis.append({
            "kpi": "unique_customers",
            "available": False,
            "reason": "No customer_id/user_id type column found"
        })

    # --- Category breakdown ---
    if roles["category_columns"] and roles["revenue_columns"]:
        kpis.append({
            "kpi": "revenue_by_category",
            "available": True,
            "source_columns": [roles["category_columns"][0], roles["revenue_columns"][0]]
        })
    else:
        kpis.append({
            "kpi": "revenue_by_category",
            "available": False,
            "reason": "Requires both a category-type column and a revenue column"
        })

    return {
        "detected_columns": roles,
        "kpis": kpis
    }