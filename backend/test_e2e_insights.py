import os
import json
import urllib.request
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://127.0.0.1:8000"

# 1. Login to get token
login_payload = json.dumps({"username": "user_7bd4e7", "password": "SecretPassword123"}).encode('utf-8')
req = urllib.request.Request(f"{BASE_URL}/api/login", data=login_payload, headers={"Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req) as resp:
        login_data = json.loads(resp.read().decode('utf-8'))
        token = login_data["token"]
        print("Logged in successfully! Token:", token[:12] + "...")
except Exception as e:
    print("Could not login as user_7bd4e7, trying test signup...")
    import uuid
    u = f"test_{uuid.uuid4().hex[:6]}"
    signup_payload = json.dumps({"username": u, "email": f"{u}@example.com", "password": "TestPassword123"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/signup", data=signup_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        signup_data = json.loads(resp.read().decode('utf-8'))
    # now login
    login_payload = json.dumps({"username": u, "password": "TestPassword123"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/login", data=login_payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        login_data = json.loads(resp.read().decode('utf-8'))
        token = login_data["token"]

# 2. Get tables
req = urllib.request.Request(f"{BASE_URL}/api/tables", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req) as resp:
    tables_data = json.loads(resp.read().decode('utf-8'))
    tables = tables_data.get("tables", [])
    print(f"User tables count: {len(tables)}")
    if not tables:
        # Upload a test dataset
        print("Uploading a test dataset...")
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="sales_data.csv"\r\n'
            f"Content-Type: text/csv\r\n\r\n"
            f"date,revenue,category\r\n"
            f"2026-01-01,150,Electronics\r\n"
            f"2026-01-02,200,Electronics\r\n"
            f"2026-01-03,180,Apparel\r\n"
            f"2026-01-04,320,Electronics\r\n"
            f"2026-01-05,210,Apparel\r\n"
            f"2026-01-06,290,Electronics\r\n"
            f"2026-01-07,310,Electronics\r\n"
            f"2026-01-08,190,Apparel\r\n"
            f"--{boundary}--\r\n"
        ).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/api/upload",
            data=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}"
            }
        )
        with urllib.request.urlopen(req) as resp:
            up_data = json.loads(resp.read().decode('utf-8'))
            dataset_id = up_data["table_name"]
            print("Uploaded table:", dataset_id)
    else:
        dataset_id = tables[0]
        print("Testing with existing table:", dataset_id)

# 3. Test GET /api/insights/{dataset_id}
print(f"\n--- Testing GET /api/insights/{dataset_id} ---")
req = urllib.request.Request(f"{BASE_URL}/api/insights/{dataset_id}?regenerate=true", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req) as resp:
    insights = json.loads(resp.read().decode('utf-8'))

print("[OK] Key takeaway:", insights.get("key_takeaway"))
assert bool(insights.get("key_takeaway")), "Key takeaway must not be empty"

cards = insights.get("insights", [])
print(f"[OK] Cards count: {len(cards)}")
assert len(cards) == 4, f"Expected 4 cards, got {len(cards)}"

types = [c["type"] for c in cards]
print(f"[OK] Card types: {types}")
assert "performance" in types
assert "growth" in types
assert "risk" in types
assert "recommendation" in types

for c in cards:
    assert bool(c.get("key_number")), f"Card {c['type']} missing key_number"
    assert "mini_chart_data" in c and isinstance(c["mini_chart_data"], list), f"Card {c['type']} missing mini_chart_data"
    print(f"  * [{c['type'].upper()}] Proof: {c['key_number']} | Sparkline points: {len(c['mini_chart_data'])}")

fc = insights.get("forecast_outlook", {})
print("[OK] Forecast Outlook:", fc.get("trend_label"), "| Expected Growth:", fc.get("expected_growth_str"), "| Confidence:", fc.get("confidence_level"))
assert bool(fc.get("trend_direction")), "Forecast missing trend_direction"

# 4. Test Caching
print("\n--- Testing Caching ---")
req = urllib.request.Request(f"{BASE_URL}/api/insights/{dataset_id}", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req) as resp:
    cached_insights = json.loads(resp.read().decode('utf-8'))
print("[OK] Cached flag:", cached_insights.get("cached"))
assert cached_insights.get("cached") is True, "Expected cached=True"

# 5. Test Download Insights CSV
print("\n--- Testing GET /api/insights/{dataset_id}/download ---")
req = urllib.request.Request(f"{BASE_URL}/api/insights/{dataset_id}/download", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req) as resp:
    csv_bytes = resp.read()
    print(f"[OK] Download report received, size: {len(csv_bytes)} bytes")
    assert b"BIZVISION AI BUSINESS INSIGHTS REPORT" in csv_bytes
    assert b"EXECUTIVE KEY TAKEAWAY" in csv_bytes

# 6. Test Send Insights Email
print("\n--- Testing POST /api/insights/{dataset_id}/email ---")
req = urllib.request.Request(f"{BASE_URL}/api/insights/{dataset_id}/email", data=b"{}", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    email_res = json.loads(resp.read().decode('utf-8'))
    print("[OK] Email dispatch result:", email_res)
    assert email_res.get("success") is True

print("\nALL BACKEND HTTP ENDPOINT INTEGRATION TESTS PASSED 100%!")
