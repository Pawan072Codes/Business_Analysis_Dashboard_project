import uuid
from fastapi.testclient import TestClient
from main import app
from database import init_db

client = TestClient(app)

def test_full_pipeline():
    init_db()

    # 1. Signup test user
    username = f"testuser_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"
    password = "SecretPassword123"


    signup_res = client.post("/api/signup", json={
        "username": username,
        "email": email,
        "password": password
    })
    assert signup_res.status_code == 200, signup_res.text
    signup_data = signup_res.json()
    assert signup_data["success"] is True
    assert signup_data["user"]["username"] == username

    # 2. Login test
    login_res = client.post("/api/login", json={
        "username": username,
        "password": password
    })
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["token"]
    assert token is not None

    headers = {"Authorization": f"Bearer {token}"}

    # 3. Unauthenticated access check
    unauth_res = client.get("/api/tables")
    assert unauth_res.status_code == 401

    # 4. Authenticated fetch tables (should be empty for new user)
    tables_res = client.get("/api/tables", headers=headers)
    assert tables_res.status_code == 200
    assert tables_res.json()["success"] is True

    # 5. Upload dataset under logged in user
    csv_data = "date,revenue,category\n2025-01-01,100,Sales\n2025-01-02,150,Sales\n2025-01-03,200,Service\n"
    files = {"file": ("test_sales.csv", csv_data, "text/csv")}

    upload_res = client.post("/api/upload", files=files, headers=headers)
    assert upload_res.status_code == 200, upload_res.text
    dataset_id = upload_res.json()["table_name"]

    # 6. Verify table list now contains dataset
    user_tables = client.get("/api/tables", headers=headers).json()["tables"]
    assert dataset_id in user_tables

    # 7. Check Analytics endpoint (Part 0 requirement 1)
    analytics_res = client.get(f"/api/analytics/{dataset_id}", headers=headers)
    assert analytics_res.status_code == 200
    analytics_data = analytics_res.json()
    assert analytics_data["dataset_id"] == dataset_id
    assert "kpis" in analytics_data

    # 8. Check Forecast endpoints (Part 0 requirements 2 & 3)
    # Check initial forecast request before model training (should return 404 clear error)
    forecast_unready = client.get(f"/api/forecast/{dataset_id}", headers=headers)
    assert forecast_unready.status_code == 404
    assert "No trained model found" in forecast_unready.json()["detail"]

    # Train model for specific dataset_id
    train_res = client.post(f"/api/train/{dataset_id}", headers=headers)
    assert train_res.status_code == 200, train_res.text
    assert train_res.json()["success"] is True

    # Get forecast after training
    forecast_res = client.get(f"/api/forecast/{dataset_id}?days=10", headers=headers)
    assert forecast_res.status_code == 200, forecast_res.text
    assert len(forecast_res.json()["forecast"]) == 10

    # 9. Download report endpoint (Part C requirement 10)
    download_res = client.get(f"/api/download/{dataset_id}", headers=headers)
    assert download_res.status_code == 200
    assert "text/csv" in download_res.headers["content-type"]
    assert "# BizVision Analytics Report" in download_res.text

    # 10. Manual send email endpoint (Part C requirement 12 & 14)
    # Should complete with warning if SMTP credentials are missing
    send_email_res = client.post(f"/api/send-report/{dataset_id}", headers=headers)
    assert send_email_res.status_code == 200
    assert send_email_res.json()["success"] is True

    print("\n✅ ALL BACKEND SUITE TESTS PASSED SUCCESSFULLY!")


def test_duplicate_upload_same_filename_succeeds():
    init_db()

    username = f"dupuser_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"
    password = "SecretPassword123"

    signup_res = client.post("/api/signup", json={
        "username": username,
        "email": email,
        "password": password
    })
    assert signup_res.status_code == 200, signup_res.text

    login_res = client.post("/api/login", json={
        "username": username,
        "password": password
    })
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    csv_data = "date,revenue\n2025-01-01,100\n2025-01-02,150\n"
    files = {"file": ("output.csv", csv_data, "text/csv")}

    first = client.post("/api/upload", files=files, headers=headers)
    assert first.status_code == 200, first.text

    second = client.post("/api/upload", files=files, headers=headers)
    assert second.status_code == 200, second.text
    assert first.json()["table_name"] != second.json()["table_name"]


if __name__ == "__main__":
    test_full_pipeline()
