import os
import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

MODEL_DIR = "saved_models"
os.makedirs(MODEL_DIR, exist_ok=True)


def evaluate_model(model, X_test, y_test):
    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    rmse = np.sqrt(mean_squared_error(y_test, predictions))
    avg_target = y_test.mean()
    mae_percent = (mae / avg_target * 100) if avg_target != 0 else 0
    return {
        "mae": round(float(mae), 2),
        "rmse": round(float(rmse), 2),
        "mae_percent_of_average": round(float(mae_percent), 2),
        "average_actual_value": round(float(avg_target), 2)
    }, predictions


def train_forecasting_model(feature_result: dict, table_name: str) -> dict:
    train_df = feature_result["train_df"]
    test_df = feature_result["test_df"]
    feature_columns = feature_result["feature_columns"]
    target_column = feature_result["target_column"]

    X_train = train_df[feature_columns]
    y_train = train_df[target_column]
    X_test = test_df[feature_columns]
    y_test = test_df[target_column]

    # ---- Dono models train karo ----
    rf_model = RandomForestRegressor(n_estimators=100, random_state=42)
    rf_model.fit(X_train, y_train)
    rf_metrics, rf_predictions = evaluate_model(rf_model, X_test, y_test)

    lr_model = LinearRegression()
    lr_model.fit(X_train, y_train)
    lr_metrics, lr_predictions = evaluate_model(lr_model, X_test, y_test)

    # ---- jo behtar hai (kam MAE), usi ko final model banao ----
    if rf_metrics["mae"] <= lr_metrics["mae"]:
        best_model = rf_model
        best_model_name = "Random Forest"
        best_metrics = rf_metrics
        best_predictions = rf_predictions
    else:
        best_model = lr_model
        best_model_name = "Linear Regression"
        best_metrics = lr_metrics
        best_predictions = lr_predictions

    # ---- best model ko save karo ----
    model_filename = f"{table_name}_model.joblib"
    model_path = os.path.join(MODEL_DIR, model_filename)
    joblib.dump(best_model, model_path)

    return {
        "success": True,
        "model_path": model_path,
        "chosen_model": best_model_name,
        "comparison": {
            "random_forest": rf_metrics,
            "linear_regression": lr_metrics
        },
        "metrics": best_metrics,
        "test_predictions_vs_actual": [
            {"actual": round(float(a), 2), "predicted": round(float(p), 2)}
            for a, p in zip(y_test, best_predictions)
        ]
    }


def load_model(table_name: str):
    model_path = os.path.join(MODEL_DIR, f"{table_name}_model.joblib")
    if not os.path.exists(model_path):
        return None
    return joblib.load(model_path)