import pandas as pd
from services.kpi_detector import generate_kpi_list
import json

# koi bhi business-relevant keyword na ho aise columns
data = {
    "name": ["Amit", "Priya", "Rahul"],
    "age": [28, 32, 25]
}
df = pd.DataFrame(data)

result = generate_kpi_list(df)
print(json.dumps(result, indent=2))