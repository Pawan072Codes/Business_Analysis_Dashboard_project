import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
import json
from datetime import datetime, timedelta

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()

# ───────────────────────────────────────────────────────────────────
# ANALYTICS ENDPOINTS — Fetch data for dashboard visualizations
# ───────────────────────────────────────────────────────────────────

@router.get("/data/{table_name}")
def get_table_data(table_name: str, skip: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)):
    """
    Fetch paginated data from uploaded dataset
    
    Args:
        table_name: Name of the table to query
        skip: Number of rows to skip (for pagination)
        limit: Max rows to return (1-100)
    
    Returns:
        Paginated data and total row count
    """
    try:
        # Get total count
        count_query = f'SELECT COUNT(*) FROM "{table_name}"'
        with engine.connect() as conn:
            result = conn.execute(text(count_query))
            total = result.scalar()
        
        # Get paginated data
        data_query = f'SELECT * FROM "{table_name}" LIMIT {limit} OFFSET {skip}'
        df = pd.read_sql(data_query, engine)
        
        # Convert to dict format
        data = df.to_dict(orient='records')
        
        return {
            "data": data,
            "total": total,
            "skip": skip,
            "limit": limit,
            "pages": (total // limit) + (1 if total % limit > 0 else 0)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/kpi/{table_name}")
def get_kpis(table_name: str):
    """
    Calculate Key Performance Indicators from dataset
    
    Returns:
        total_revenue, growth_rate, transaction_count, forecast_accuracy
    """
    try:
        df = pd.read_sql(f'SELECT * FROM "{table_name}"', engine)
        
        # Find numeric columns
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        
        if not numeric_cols:
            raise HTTPException(status_code=400, detail="No numeric columns found")
        
        # Use first numeric column as "revenue"
        revenue_col = numeric_cols[0]
        
        # Calculate KPIs
        total_revenue = float(df[revenue_col].sum())
        
        # Growth rate (compare last week to previous week)
        if len(df) >= 14:
            recent = df[revenue_col].tail(7).sum()
            previous = df[revenue_col].tail(14).head(7).sum()
            growth_rate = (recent - previous) / previous if previous > 0 else 0
        else:
            growth_rate = 0
        
        transaction_count = len(df)
        forecast_accuracy = 0.92  # Mock value for now
        
        return {
            "total_revenue": round(total_revenue, 2),
            "growth_rate": round(growth_rate, 4),
            "transaction_count": transaction_count,
            "forecast_accuracy": forecast_accuracy
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/analytics/{table_name}")
def get_analytics(
    table_name: str, 
    analysis_type: str = Query("trend", pattern="^(trend|distribution|category)$"),
    column: str = Query(None)
):
    """
    Fetch analytics data for different chart types
    
    Args:
        table_name: Name of table to analyze
        analysis_type: 'trend' (time series), 'distribution' (histogram), 'category' (pie/bar)
        column: Column name to analyze (auto-detected if None)
    
    Returns:
        Formatted data for charting
    """
    try:
        df = pd.read_sql(f'SELECT * FROM "{table_name}" LIMIT 100', engine)
        
        if analysis_type == "trend":
            # Time series trend
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            if not numeric_cols:
                raise HTTPException(status_code=400, detail="No numeric columns")
            
            col = column or numeric_cols[0]
            data = [
                {"date": f"2026-08-{i+1:02d}", "value": float(row[col])}
                for i, (_, row) in enumerate(df.tail(30).iterrows())
                if not pd.isna(row[col])
            ]
        
        elif analysis_type == "distribution":
            # Histogram distribution
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            col = column or numeric_cols[0]
            
            # Create bins and count
            bins = pd.cut(df[col], bins=5)
            dist = bins.value_counts().sort_index()
            
            data = [
                {
                    "range": str(interval),
                    "count": int(count)
                }
                for interval, count in dist.items()
            ]
        
        elif analysis_type == "category":
            # Category breakdown (find text columns)
            text_cols = df.select_dtypes(include=['object']).columns.tolist()
            if not text_cols:
                numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
                col = column or numeric_cols[0]
                # Group by first 5 rows as categories
                data = [
                    {"category": f"Category {i+1}", "value": float(row[col])}
                    for i, (_, row) in enumerate(df.head(5).iterrows())
                ]
            else:
                col = text_cols[0]
                value_col = df.select_dtypes(include=['number']).columns[0] if df.select_dtypes(include=['number']).shape[1] > 0 else None
                
                if value_col:
                    grouped = df.groupby(col)[value_col].sum().head(5)
                    data = [
                        {"category": str(cat), "value": float(val)}
                        for cat, val in grouped.items()
                    ]
                else:
                    grouped = df[col].value_counts().head(5)
                    data = [
                        {"category": str(cat), "value": int(count)}
                        for cat, count in grouped.items()
                    ]
        
        return {"data": data, "type": analysis_type}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/insights/{table_name}")
def get_insights(table_name: str):
    """
    Generate AI-powered insights from dataset
    
    Returns:
        List of insights and recommendations
    """
    try:
        df = pd.read_sql(f'SELECT * FROM "{table_name}" LIMIT 100', engine)
        
        insights = []
        recommendations = []
        
        # Analyze numeric columns
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        
        if numeric_cols:
            main_col = numeric_cols[0]
            
            # Growth insight
            if len(df) >= 2:
                recent = df[main_col].tail(10).mean()
                previous = df[main_col].head(10).mean()
                growth = ((recent - previous) / previous * 100) if previous != 0 else 0
                
                if growth > 0:
                    insights.append(f"Revenue trend shows {growth:.1f}% growth over recent period")
                else:
                    insights.append(f"Revenue shows {abs(growth):.1f}% decline over recent period")
            
            # High variability
            std = df[main_col].std()
            mean = df[main_col].mean()
            if std > mean * 0.5:
                insights.append("High variability detected in revenue - consider seasonal factors")
            
            # Outliers
            q1 = df[main_col].quantile(0.25)
            q3 = df[main_col].quantile(0.75)
            iqr = q3 - q1
            outliers = len(df[(df[main_col] < q1 - 1.5*iqr) | (df[main_col] > q3 + 1.5*iqr)])
            
            if outliers > 0:
                insights.append(f"Found {outliers} potential outliers in data")
                recommendations.append(f"Investigate {outliers} anomalies - they may indicate data quality issues")
        
        # Text column analysis
        text_cols = df.select_dtypes(include=['object']).columns.tolist()
        if text_cols and numeric_cols:
            grouped = df.groupby(text_cols[0])[numeric_cols[0]].sum().sort_values(ascending=False)
            top_category = grouped.index[0]
            top_value = grouped.values[0]
            total = grouped.sum()
            pct = (top_value / total * 100)
            
            insights.append(f"{str(top_category)} category accounts for {pct:.1f}% of total")
            recommendations.append(f"Focus on maximizing {str(top_category)} category performance")
        
        # Add defaults if empty
        if not insights:
            insights = [
                "Dataset successfully loaded and analyzed",
                "Ready for forecasting and deeper analysis"
            ]
        
        if not recommendations:
            recommendations = [
                "Upload additional historical data for more accurate forecasts",
                "Use forecasting module to predict future trends"
            ]
        
        return {
            "insights": insights,
            "recommendations": recommendations,
            "generated_at": datetime.now().isoformat()
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
