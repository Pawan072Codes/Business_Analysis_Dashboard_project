import os
import sys
from fastapi.testclient import TestClient
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))

from main import app
from routes.auth import ACTIVE_SESSIONS

client = TestClient(app)

def run_endpoint_tests():
    print("=" * 60)
    print("FASTAPI GMAIL ENDPOINTS - INTEGRATION TEST")
    print("=" * 60)

    # 1. Unauthenticated request to /api/gmail/status
    res = client.get("/api/gmail/status")
    print(f"Unauthenticated /api/gmail/status -> {res.status_code}")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("  --> PASS: Route protection verified.")

    # 2. Authenticated request using simulated session token
    mock_token = "mock_test_session_token_12345"
    ACTIVE_SESSIONS[mock_token] = {
        "id": 9999,
        "username": "api_test_user",
        "email": "test@bizvision.io"
    }

    headers = {"Authorization": f"Bearer {mock_token}"}
    res = client.get("/api/gmail/status", headers=headers)
    print(f"Authenticated /api/gmail/status -> {res.status_code}")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data["success"] is True
    assert data["user_id"] == 9999
    assert data["connected"] is False
    assert data["status"] in ["not_connected", "error"]
    print(f"  --> PASS: User status retrieved successfully: {data}")

    # 3. Disconnect endpoint
    res_disc = client.post("/api/gmail/disconnect", headers=headers)
    print(f"Authenticated /api/gmail/disconnect -> {res_disc.status_code}")
    assert res_disc.status_code == 200
    assert res_disc.json()["success"] is True
    print("  --> PASS: Disconnect endpoint operates cleanly.")

    # 4. Callback route error handling
    res_cb_err = client.get("/api/gmail/callback?error=access_denied", follow_redirects=False)
    print(f"Callback error redirect -> {res_cb_err.status_code}, Location: {res_cb_err.headers.get('location')}")
    assert res_cb_err.status_code in [302, 307]
    assert "gmail_error=" in res_cb_err.headers.get("location")
    print("  --> PASS: OAuth callback error safely redirects back to settings with error description.")

    # 5. Clean up mock session
    if mock_token in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[mock_token]

    print("\n" + "=" * 60)
    print("ALL FASTAPI ENDPOINT TESTS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    run_endpoint_tests()
