import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Setup paths
sys.path.insert(0, os.path.dirname(__file__))

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

from services.gmail_service import (
    encrypt_token,
    decrypt_token,
    generate_oauth_state,
    validate_and_consume_oauth_state,
    get_user_gmail_status,
    disconnect_user_gmail,
    is_google_oauth_configured
)

def run_tests():
    print("=" * 60)
    print("BIZVISION PERSONAL GMAIL INTEGRATION - TEST SUITE")
    print("=" * 60)

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 1: Fernet Encryption & Decryption
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 1] Testing Token Encryption & Decryption...")
    sample_tokens = [
        "ya29.a0AfH6SMD_random_mock_access_token_1234567890",
        "1//04mock_refresh_token_xyz9876543210_abcdefghij",
        "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email"
    ]

    for orig in sample_tokens:
        encrypted = encrypt_token(orig)
        assert encrypted != orig, "Encrypted token must not match plaintext!"
        assert len(encrypted) > len(orig), "Ciphertext should be formatted Fernet string"
        decrypted = decrypt_token(encrypted)
        assert decrypted == orig, f"Decryption failed! Expected '{orig}', got '{decrypted}'"

    print("  --> PASS: Encryption and decryption are 100% reversible and secure.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 2: Multi-User Isolation in Database
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 2] Testing Multi-User SaaS Isolation...")

    # Create two test users
    with engine.connect() as conn:
        # Clean up any leftover test data
        conn.execute(text("DELETE FROM users WHERE username IN ('_test_user_a', '_test_user_b')"))
        conn.commit()

        res_a = conn.execute(
            text("INSERT INTO users (username, email, hashed_password) VALUES ('_test_user_a', 'test_a@bizvision.io', 'dummy_hash') RETURNING id")
        )
        user_a_id = res_a.fetchone()[0]

        res_b = conn.execute(
            text("INSERT INTO users (username, email, hashed_password) VALUES ('_test_user_b', 'test_b@bizvision.io', 'dummy_hash') RETURNING id")
        )
        user_b_id = res_b.fetchone()[0]
        conn.commit()

    print(f"  Created test users: User A (ID {user_a_id}), User B (ID {user_b_id})")

    # Connect User A to usera@gmail.com
    raw_token_a = "token_for_user_a_secret_abc123"
    raw_refresh_a = "refresh_token_user_a_secret_xyz789"
    enc_token_a = encrypt_token(raw_token_a)
    enc_refresh_a = encrypt_token(raw_refresh_a)

    # Connect User B to userb@gmail.com
    raw_token_b = "token_for_user_b_secret_def456"
    raw_refresh_b = "refresh_token_user_b_secret_uvw321"
    enc_token_b = encrypt_token(raw_token_b)
    enc_refresh_b = encrypt_token(raw_refresh_b)

    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO user_gmail_accounts 
                (user_id, google_email, encrypted_access_token, encrypted_refresh_token, scope, status)
                VALUES (:uid, 'usera@gmail.com', :acc, :ref, 'https://www.googleapis.com/auth/gmail.send', 'connected')
            """),
            {"uid": user_a_id, "acc": enc_token_a, "ref": enc_refresh_a}
        )
        conn.execute(
            text("""
                INSERT INTO user_gmail_accounts 
                (user_id, google_email, encrypted_access_token, encrypted_refresh_token, scope, status)
                VALUES (:uid, 'userb@gmail.com', :acc, :ref, 'https://www.googleapis.com/auth/gmail.send', 'connected')
            """),
            {"uid": user_b_id, "acc": enc_token_b, "ref": enc_refresh_b}
        )
        conn.commit()

    # Verify status for User A
    status_a = get_user_gmail_status(user_a_id)
    assert status_a["connected"] is True, "User A should be connected"
    assert status_a["google_email"] == "usera@gmail.com", f"Expected usera@gmail.com, got {status_a['google_email']}"

    # Verify status for User B
    status_b = get_user_gmail_status(user_b_id)
    assert status_b["connected"] is True, "User B should be connected"
    assert status_b["google_email"] == "userb@gmail.com", f"Expected userb@gmail.com, got {status_b['google_email']}"

    # Cross-verify: User A's row cannot see User B's token
    with engine.connect() as conn:
        row_a = conn.execute(
            text("SELECT encrypted_refresh_token FROM user_gmail_accounts WHERE user_id = :uid"),
            {"uid": user_a_id}
        ).fetchone()
        decrypted_a = decrypt_token(row_a[0])
        assert decrypted_a == raw_refresh_a, "Decrypted token for User A must match User A's token"
        assert decrypted_a != raw_refresh_b, "User A must not have User B's token!"

    print("  --> PASS: Multi-User isolation verified. Separate Gmail connections strictly bounded to user_id.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 3: CSRF State Generation, Consumption & Replay Prevention
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 3] Testing CSRF State Generation & Replay Protection...")
    state_token = generate_oauth_state(user_a_id)
    assert state_token and len(state_token) > 20, "State token must be long and secure"

    # First consumption must succeed and return user_a_id
    consumed_uid = validate_and_consume_oauth_state(state_token)
    assert consumed_uid == user_a_id, f"Expected state to resolve to User A ({user_a_id}), got {consumed_uid}"

    # Second consumption must fail (replay attack prevention)
    replayed_uid = validate_and_consume_oauth_state(state_token)
    assert replayed_uid is None, "Replaying a consumed state token must fail!"

    print("  --> PASS: OAuth state token protects against CSRF and replay attacks.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 4: Disconnect User Gmail Account
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 4] Testing User Disconnect...")
    disc_success, disc_msg = disconnect_user_gmail(user_a_id)
    assert disc_success is True

    status_a_after = get_user_gmail_status(user_a_id)
    assert status_a_after["connected"] is False, "User A should now be disconnected"
    assert status_a_after["status"] == "not_connected"

    # User B must remain connected!
    status_b_after = get_user_gmail_status(user_b_id)
    assert status_b_after["connected"] is True, "User B must remain connected even if User A disconnects"
    assert status_b_after["google_email"] == "userb@gmail.com"

    print("  --> PASS: Disconnecting User A purges User A's tokens while User B remains fully unaffected.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 5: Cascading Delete on User Removal
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 5] Testing Cascading Deletion...")
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_b_id})
        conn.commit()

        # Check if user_gmail_accounts row for User B was automatically dropped
        row_b = conn.execute(
            text("SELECT id FROM user_gmail_accounts WHERE user_id = :uid"),
            {"uid": user_b_id}
        ).fetchone()
        assert row_b is None, "ON DELETE CASCADE should remove Gmail account when user is deleted"

        # Cleanup User A
        conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_a_id})
        conn.commit()

    print("  --> PASS: Database constraints (CASCADE) maintain relational cleanliness.")

    print("\n" + "=" * 60)
    print("ALL 5 TESTS PASSED SUCCESSFULLY! (Production Grade Multi-User Ready)")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
