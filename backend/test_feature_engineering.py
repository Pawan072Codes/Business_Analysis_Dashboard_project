import pandas as pd
import numpy as np
from services.feature_engineering import engineer_features

# 30 din ka fake daily sales data banate hain
dates = pd.date_range(start="2024-01-01", periods=30, freq="D")
np.random.seed(42)
sales = np.random.randint(1000, 2000, size=30)

df = pd.DataFrame({"order_date": dates, "total_sales": sales})

result = engineer_features(df, date_col="order_date", target_col="total_sales")

if result["success"]:
    print("Feature engineering successful!")
    print("\nFull dataframe with features:")
    print(result["full_df"].head(10))
    print(f"\nTrain rows: {len(result['train_df'])}")
    print(f"Test rows: {len(result['test_df'])}")
    print(f"\nFeature columns used: {result['feature_columns']}")
else:
    print("Failed:", result["reason"])