import pandas as pd
import numpy as np
from services.feature_engineering import engineer_features
from services.forecasting_model import train_forecasting_model

# thoda bada, realistic dataset banate hain (60 din, halka trend + noise)
dates = pd.date_range(start="2024-01-01", periods=60, freq="D")
np.random.seed(42)
trend = np.linspace(1000, 1800, 60)  # dheere-dheere badhta trend
noise = np.random.randint(-150, 150, size=60)
sales = trend + noise

df = pd.DataFrame({"order_date": dates, "total_sales": sales})

feature_result = engineer_features(df, date_col="order_date", target_col="total_sales")

if feature_result["success"]:
    result = train_forecasting_model(feature_result, table_name="test_forecast")
    print("Model trained and saved at:", result["model_path"])
    print("\nMetrics:")
    print(result["metrics"])
    print("\nSample predictions vs actual (test set):")
    for row in result["test_predictions_vs_actual"]:
        print(row)
else:
    print("Feature engineering failed:", feature_result["reason"])