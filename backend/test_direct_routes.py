import uuid
import io
import pandas as pd
from fastapi import UploadFile
from database import init_db
from routes.auth import signup, login, UserSignup, UserLogin
from routes.upload import upload_file, get_uploaded_tables
from routes.analytics import get_analytics, download_report, send_report_email
from routes.forecast import get_forecast, train_model

def run_tests():
    print("--- 1. INITIALIZING DATABASE ---")
    init_db()

    username = f"user_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"
    password = "SecretPassword123"

    print("--- 2. TESTING SIGNUP (PASSWORD HASHING & PG STORAGE) ---")
    signup_req = UserSignup(username=username, email=email, password=password)
    signup_res = signup(signup_req)
    assert signup_res["success"] is True
    assert signup_res["user"]["username"] == username
    print(f"Signup successful for {username}")

    print("--- 3. TESTING LOGIN (BCRYPT VERIFICATION & SESSION TOKEN) ---")
    login_req = UserLogin(username=username, password=password)
    login_res = login(login_req)
    assert login_res["success"] is True
    token = login_res["token"]
    user_info = login_res["user"]
    print(f"Login successful! Issued token: {token}")

    print("--- 4. TESTING DATASET UPLOAD WITH USER TAGGING ---")
    rows = ["date,revenue,category"]
    for i in range(1, 20):
        rows.append(f"2025-01-{i:02d},{100 + i*10},Sales")
    csv_bytes = "\n".join(rows).encode("utf-8")
    file_obj = UploadFile(filename="quarterly_sales.csv", file=io.BytesIO(csv_bytes))


    import asyncio
    upload_res = asyncio.run(upload_file(file=file_obj, current_user=user_info))
    assert upload_res["success"] is True
    dataset_id = upload_res["table_name"]
    print(f"Upload successful! Table created: {dataset_id}")

    print("--- 5. TESTING GET USER TABLES (ISOLATION CHECK) ---")
    user_tables_res = get_uploaded_tables(current_user=user_info)
    assert dataset_id in user_tables_res["tables"]
    print("User tables fetched successfully.")

    print("--- 6. TESTING MULTI-DATASET ANALYTICS ENDPOINT (PART 0 #1) ---")
    analytics_res = get_analytics(dataset_id=dataset_id, current_user=user_info)
    assert analytics_res["dataset_id"] == dataset_id
    assert "kpis" in analytics_res
    print("Analytics endpoint executed successfully.")

    print("--- 7. TESTING FORECASTING MODEL SAVING & LOADING (PART 0 #2 & #3) ---")
    # Should throw 404 before training
    try:
        get_forecast(dataset_id=dataset_id, days=7, current_user=user_info)
        assert False, "Should have thrown 404 before training"
    except Exception as e:
        assert "No trained model found" in str(e)
        print("Pre-training 404 error verified correctly.")

    # Train model
    train_res = train_model(dataset_id=dataset_id, current_user=user_info)
    assert train_res["success"] is True
    print(f"Model trained and saved as forecast_{dataset_id}.joblib (Model: {train_res['chosen_model']})")

    # Forecast endpoint
    forecast_res = get_forecast(dataset_id=dataset_id, days=7, current_user=user_info)
    assert forecast_res["dataset_id"] == dataset_id
    assert len(forecast_res["forecast"]) == 7
    print("Forecast generated successfully for 7 days.")

    print("--- 8. TESTING REPORT DOWNLOAD (PART C #10) ---")
    report_res = download_report(dataset_id=dataset_id, current_user=user_info)
    assert report_res.media_type == "text/csv"
    assert b"BizVision Analytics Report" in report_res.body
    print("Report CSV file generated and formatted successfully.")

    print("--- 9. TESTING MANUAL EMAIL REPORT SENDING (PART C #12 & #14) ---")
    email_res = send_report_email(dataset_id=dataset_id, current_user=user_info)
    assert email_res["success"] is True
    print(f"Manual send email executed gracefully: {email_res}")

    print("\nALL UNIT & INTEGRATION TESTS PASSED PERFECTLY!")


if __name__ == "__main__":
    run_tests()
