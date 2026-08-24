import pandas as pd
from services.kpi_detector import generate_kpi_list

data = {
    "order_date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
    "customer_id": [101, 102, 101],
    "product_category": ["Electronics", "Clothing", "Electronics"],
    "total_sales": [1500, 800, 1200],
    "profit": [300, 100, 250],
    "quantity": [3, 2, 4]
}
df = pd.DataFrame(data)

result = generate_kpi_list(df)
import json
print(json.dumps(result, indent=2))