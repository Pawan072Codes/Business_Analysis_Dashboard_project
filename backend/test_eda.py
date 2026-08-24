import pandas as pd
from services.eda import run_eda

data = {
    "name": ["Amit", "Priya", "Rahul", "Sonia", "Kiran"],
    "date": pd.to_datetime(["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01", "2024-05-01"]),
    "sales": [1000, 1500, 1200, 1800, 2000],
    "profit": [200, 300, 250, 400, 450]
}
df = pd.DataFrame(data)

result = run_eda(df, "test_table")
print(result)