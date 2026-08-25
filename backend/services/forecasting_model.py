import os
import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

MODEL_DIR = "saved_models"
os.makedirs(MODEL_DIR, exist_ok=True)


def train_forecasting_model(feature_result: dict, table_name: str) -> dict:
    """
    feature_result: engineer_features() ka output (Phase 6 se)
    table_name: model file ka naam banane ke liye
    """
    train_df = feature_result["train_df"]
    test_df = feature_result["test_df"]
    feature_columns = feature_result["feature_columns"]
    target_column = feature_result["target_column"]

    X_train = train_df[feature_columns]
    y_train = train_df[target_column]
    X_test = test_df[feature_columns]
    y_test = test_df[target_column]

    # ---- Model train karo ----
    # n_estimators = kitne decision trees banayenge (100 = good default)
    # random_state = fixed number, taaki result reproducible ho (har baar same aaye)
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # ---- Test data pe predict karo, evaluate karo ----
    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = np.sqrt(mean_squared_error(y_test, predictions))

    # context ke liye — average target value, taaki MAE/RMSE ka % samajh aaye
    avg_target = y_test.mean()
    mae_percent = (mae / avg_target * 100) if avg_target != 0 else 0

    # ---- Model file mein save karo (reuse ke liye, retrain na karna pade) ----
    model_filename = f"{table_name}_model.joblib"
    model_path = os.path.join(MODEL_DIR, model_filename)
    joblib.dump(model, model_path)

    return {
        "success": True,
        "model_path": model_path,
        "metrics": {
            "mae": round(float(mae), 2),
            "rmse": round(float(rmse), 2),
            "mae_percent_of_average": round(float(mae_percent), 2),
            "average_actual_value": round(float(avg_target), 2)
        },
        "test_predictions_vs_actual": [
            {"actual": round(float(a), 2), "predicted": round(float(p), 2)}
            for a, p in zip(y_test, predictions)
        ]
    }


def load_model(table_name: str):
    """Pehle se saved model wapas load karta hai, retrain nahi karna padta"""
    model_path = os.path.join(MODEL_DIR, f"{table_name}_model.joblib")
    if not os.path.exists(model_path):
        return None
    return joblib.load(model_path)