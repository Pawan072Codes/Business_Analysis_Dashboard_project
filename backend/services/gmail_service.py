import os
import base64
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()
backend_dir = Path(__file__).resolve().parent.parent
root_dir = backend_dir.parent
load_dotenv(backend_dir / ".env")
load_dotenv(root_dir / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

logger = logging.getLogger(__name__)

# Google OAuth Scopes: strictly gmail.send + user identity for multi-user isolation
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]

# Dynamic client configuration getters
def get_google_client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()

def get_google_client_secret() -> str:
    return os.getenv("GOOGLE_CLIENT_SECRET", "").strip()

def get_google_redirect_uri() -> str:
    return os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/api/gmail/callback").strip()

def is_google_oauth_configured() -> bool:
    """Checks whether Google OAuth client credentials are configured and not placeholder values."""
    cid = get_google_client_id()
    csec = get_google_client_secret()
    if not cid or not csec:
        return False
    if "your-google-client-id" in cid.lower() or "your-google-client-secret" in csec.lower():
        return False
    return True

# ─────────────────────────────────────────────────────────────────────────────
# 1. FERNET ENCRYPTION HELPERS (Token Security at Rest)
# ─────────────────────────────────────────────────────────────────────────────

def _get_or_create_encryption_key() -> bytes:
    """
    Retrieves the 32-byte Fernet key from environment, or generates a fresh one
    and writes it to .env so credentials can be encrypted and decrypted reliably.
    """
    key_str = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY", "").strip()
    if key_str:
        return key_str.encode("utf-8")

    from cryptography.fernet import Fernet
    new_key = Fernet.generate_key().decode("utf-8")
    os.environ["GOOGLE_TOKEN_ENCRYPTION_KEY"] = new_key

    # Attempt to persist to .env in root or backend directory
    for target_env in [root_dir / ".env", backend_dir / ".env"]:
        try:
            if target_env.exists():
                with open(target_env, "a", encoding="utf-8") as f:
                    f.write(f"\nGOOGLE_TOKEN_ENCRYPTION_KEY={new_key}\n")
                break
        except Exception as e:
            logger.warning(f"Could not persist GOOGLE_TOKEN_ENCRYPTION_KEY to {target_env}: {e}")

    return new_key.encode("utf-8")


def encrypt_token(token_str: str) -> str:
    """Encrypts sensitive OAuth tokens before storing in PostgreSQL."""
    if not token_str:
        return ""
    from cryptography.fernet import Fernet
    f = Fernet(_get_or_create_encryption_key())
    return f.encrypt(token_str.encode("utf-8")).decode("utf-8")


def decrypt_token(cipher_text: str) -> str:
    """Decrypts ciphertext retrieved from PostgreSQL."""
    if not cipher_text:
        return ""
    from cryptography.fernet import Fernet
    f = Fernet(_get_or_create_encryption_key())
    return f.decrypt(cipher_text.encode("utf-8")).decode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# 2. OAUTH STATE MANAGEMENT (CSRF Protection)
# ─────────────────────────────────────────────────────────────────────────────

def generate_oauth_state(user_id: int) -> str:
    """
    Generates a cryptographically random state token linked to user_id,
    with a 15-minute expiration time, and stores it in database.
    """
    state_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    with engine.connect() as conn:
        # Clean up expired states for this user
        conn.execute(
            text("DELETE FROM user_oauth_states WHERE user_id = :uid OR expires_at < CURRENT_TIMESTAMP"),
            {"uid": user_id}
        )
        conn.execute(
            text("""
                INSERT INTO user_oauth_states (user_id, state_token, expires_at)
                VALUES (:uid, :st, :exp)
            """),
            {"uid": user_id, "st": state_token, "exp": expires_at}
        )
        conn.commit()

    return state_token


def validate_and_consume_oauth_state(state_token: str) -> Optional[int]:
    """
    Validates state token, returns user_id if valid and not expired,
    and removes the state token to prevent replay attacks.
    """
    if not state_token:
        return None

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT user_id, expires_at 
                FROM user_oauth_states 
                WHERE state_token = :st
            """),
            {"st": state_token}
        ).fetchone()

        if not row:
            return None

        user_id, expires_at = row[0], row[1]
        
        # Delete used state
        conn.execute(
            text("DELETE FROM user_oauth_states WHERE state_token = :st"),
            {"st": state_token}
        )
        conn.commit()

        if expires_at and expires_at < datetime.utcnow():
            return None

        return user_id


# ─────────────────────────────────────────────────────────────────────────────
# 3. GOOGLE OAUTH FLOW GENERATION & TOKEN EXCHANGE
# ─────────────────────────────────────────────────────────────────────────────

def get_oauth_flow(state: Optional[str] = None):
    """Initializes Google OAuth Flow from environment client configuration."""
    from google_auth_oauthlib.flow import Flow

    if not is_google_oauth_configured():
        raise ValueError(
            "Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not set in .env."
        )

    client_config = {
        "web": {
            "client_id": get_google_client_id(),
            "client_secret": get_google_client_secret(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [get_google_redirect_uri()]
        }
    }

    flow = Flow.from_client_config(
        client_config=client_config,
        scopes=GMAIL_SCOPES,
        state=state
    )
    flow.redirect_uri = get_google_redirect_uri()
    return flow


def create_authorization_url(user_id: int) -> Tuple[str, str]:
    """
    Builds Google authorization URL with CSRF state for user.
    Forces prompt='consent' and access_type='offline' to guarantee a refresh token.
    """
    state = generate_oauth_state(user_id)
    flow = get_oauth_flow(state=state)
    
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return auth_url, state


def exchange_code_and_store_credentials(code: str, state: str) -> Dict[str, Any]:
    """
    Validates CSRF state, exchanges authorization code for tokens,
    inspects the connected Gmail profile, encrypts tokens, and upserts
    into user_gmail_accounts for the validated user.
    """
    user_id = validate_and_consume_oauth_state(state)
    if not user_id:
        raise ValueError("Invalid or expired OAuth state token. Please restart authorization.")

    flow = get_oauth_flow(state=state)
    flow.fetch_token(code=code)
    credentials = flow.credentials

    if not credentials:
        raise ValueError("Failed to retrieve credentials from Google.")

    from googleapiclient.discovery import build

    # Retrieve the authorized Google email address
    google_email = None
    try:
        gmail_service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        profile = gmail_service.users().getProfile(userId="me").execute()
        google_email = profile.get("emailAddress")
    except Exception as e:
        logger.warning(f"Could not fetch profile via Gmail API: {e}")

    # Fallback to userinfo API if needed
    if not google_email:
        try:
            oauth2_service = build("oauth2", "v2", credentials=credentials, cache_discovery=False)
            user_info = oauth2_service.userinfo().get().execute()
            google_email = user_info.get("email")
        except Exception as e:
            logger.warning(f"Could not fetch userinfo via OAuth2 API: {e}")

    if not google_email:
        raise ValueError("Could not determine Gmail address from authorization.")

    # Encrypt tokens
    access_token = credentials.token
    refresh_token = credentials.refresh_token
    token_expiry = credentials.expiry

    if not refresh_token:
        # Check if existing refresh token is already stored in database
        with engine.connect() as conn:
            existing = conn.execute(
                text("SELECT encrypted_refresh_token FROM user_gmail_accounts WHERE user_id = :uid"),
                {"uid": user_id}
            ).fetchone()
            if existing and existing[0]:
                refresh_token = decrypt_token(existing[0])
            else:
                raise ValueError("No refresh token received from Google. Please revoke app access and reconnect.")

    enc_access = encrypt_token(access_token)
    enc_refresh = encrypt_token(refresh_token)
    scopes_str = " ".join(credentials.scopes or GMAIL_SCOPES)

    # Upsert into user_gmail_accounts
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO user_gmail_accounts (
                    user_id, google_email, encrypted_access_token, encrypted_refresh_token,
                    token_expiry, scope, status, last_error, updated_at
                ) VALUES (
                    :uid, :email, :enc_access, :enc_refresh,
                    :expiry, :scope, 'connected', NULL, CURRENT_TIMESTAMP
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    google_email = EXCLUDED.google_email,
                    encrypted_access_token = EXCLUDED.encrypted_access_token,
                    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
                    token_expiry = EXCLUDED.token_expiry,
                    scope = EXCLUDED.scope,
                    status = 'connected',
                    last_error = NULL,
                    updated_at = CURRENT_TIMESTAMP
            """),
            {
                "uid": user_id,
                "email": google_email,
                "enc_access": enc_access,
                "enc_refresh": enc_refresh,
                "expiry": token_expiry,
                "scope": scopes_str
            }
        )
        conn.commit()

    return {
        "success": True,
        "user_id": user_id,
        "google_email": google_email,
        "message": f"Successfully connected Gmail account ({google_email})"
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. CREDENTIAL RESOLUTION & AUTOMATIC REFRESH
# ─────────────────────────────────────────────────────────────────────────────

def get_user_credentials(user_id: int):
    """
    Retrieves stored credentials for user, decrypts them in memory,
    refreshes access token if expired, and updates database if refreshed.
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT google_email, encrypted_access_token, encrypted_refresh_token, 
                       token_expiry, scope, status
                FROM user_gmail_accounts
                WHERE user_id = :uid
            """),
            {"uid": user_id}
        ).fetchone()

    if not row:
        return None, None

    google_email = row[0]
    enc_access = row[1]
    enc_refresh = row[2]
    token_expiry = row[3]
    scopes_str = row[4] or " ".join(GMAIL_SCOPES)
    status = row[5]

    access_token = decrypt_token(enc_access) if enc_access else None
    refresh_token = decrypt_token(enc_refresh) if enc_refresh else None

    if not refresh_token:
        return None, google_email

    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    scopes = scopes_str.split() if scopes_str else GMAIL_SCOPES

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=get_google_client_id(),
        client_secret=get_google_client_secret(),
        scopes=scopes,
        expiry=token_expiry
    )

    # Check if access token is expired or missing, and refresh if needed
    if not creds.valid or (creds.expiry and creds.expiry <= datetime.utcnow()):
        try:
            creds.refresh(Request())
            # Save newly refreshed access token & expiry
            new_enc_access = encrypt_token(creds.token)
            with engine.connect() as conn:
                conn.execute(
                    text("""
                        UPDATE user_gmail_accounts
                        SET encrypted_access_token = :new_acc,
                            token_expiry = :new_exp,
                            status = 'connected',
                            last_error = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = :uid
                    """),
                    {
                        "new_acc": new_enc_access,
                        "new_exp": creds.expiry,
                        "uid": user_id
                    }
                )
                conn.commit()
        except Exception as refresh_err:
            logger.error(f"Failed to refresh Gmail token for user {user_id}: {refresh_err}")
            with engine.connect() as conn:
                conn.execute(
                    text("""
                        UPDATE user_gmail_accounts
                        SET status = 'expired',
                            last_error = :err,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = :uid
                    """),
                    {"err": str(refresh_err), "uid": user_id}
                )
                conn.commit()
            return None, google_email

    return creds, google_email


# ─────────────────────────────────────────────────────────────────────────────
# 5. USER STATUS & DISCONNECT
# ─────────────────────────────────────────────────────────────────────────────

def get_user_gmail_status(user_id: int) -> Dict[str, Any]:
    """
    Returns connection status of the user's personal Gmail integration.
    Possible states:
    - configured: (bool) server has Google client credentials
    - connected: (bool) user has an active connection
    - google_email: (str or None)
    - status: 'not_connected' | 'connected' | 'expired' | 'error'
    - last_error: (str or None)
    - updated_at: (str or None)
    """
    configured = is_google_oauth_configured()

    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT google_email, status, last_error, updated_at
                FROM user_gmail_accounts
                WHERE user_id = :uid
            """),
            {"uid": user_id}
        ).fetchone()

    if not row:
        return {
            "configured": configured,
            "connected": False,
            "google_email": None,
            "status": "not_connected",
            "last_error": None,
            "updated_at": None
        }

    google_email, status, last_error, updated_at = row[0], row[1], row[2], row[3]
    return {
        "configured": configured,
        "connected": status == "connected",
        "google_email": google_email,
        "status": status or "connected",
        "last_error": last_error,
        "updated_at": updated_at.strftime("%Y-%m-%d %H:%M") if updated_at else None
    }


def disconnect_user_gmail(user_id: int) -> Tuple[bool, str]:
    """
    Revokes the user's Google token if possible and removes their credentials
    from user_gmail_accounts.
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT encrypted_refresh_token, encrypted_access_token FROM user_gmail_accounts WHERE user_id = :uid"),
            {"uid": user_id}
        ).fetchone()

    if not row:
        return True, "No Gmail account connected"

    # Attempt to revoke token with Google
    try:
        import urllib.request
        import urllib.parse
        token_to_revoke = None
        if row[0]:
            token_to_revoke = decrypt_token(row[0])
        elif row[1]:
            token_to_revoke = decrypt_token(row[1])

        if token_to_revoke:
            revoke_url = "https://oauth2.googleapis.com/revoke"
            params = urllib.parse.urlencode({"token": token_to_revoke}).encode("utf-8")
            req = urllib.request.Request(revoke_url, data=params, headers={"Content-Type": "application/x-www-form-urlencoded"})
            urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.info(f"Token revocation notice for user {user_id}: {e}")

    # Remove database record
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM user_gmail_accounts WHERE user_id = :uid"),
            {"uid": user_id}
        )
        conn.commit()

    return True, "Gmail account disconnected successfully"


# ─────────────────────────────────────────────────────────────────────────────
# 6. GMAIL API MESSAGE DISPATCH (Multi-User SaaS Sender)
# ─────────────────────────────────────────────────────────────────────────────

def send_user_gmail_message(
    user_id: int,
    to_email: str,
    subject: str,
    body_text: str,
    attachment_bytes: Optional[bytes] = None,
    attachment_filename: Optional[str] = None
) -> Tuple[bool, str, Optional[str]]:
    """
    Sends an email using the user's own connected Gmail account via official Gmail API.
    Guarantees user isolation: User A sends from userA@gmail.com; User B sends from userB@gmail.com.

    Returns:
        (success: bool, message: str, sender_email: Optional[str])
    """
    creds, google_email = get_user_credentials(user_id)
    if not creds:
        if google_email:
            return False, "Your Gmail authorization has expired or was revoked. Please reconnect in Settings.", google_email
        return False, "Personal Gmail account is not connected. Please connect your Gmail in Settings.", None

    from googleapiclient.discovery import build

    try:
        # Build MIME message
        mime_msg = MIMEMultipart()
        mime_msg["From"] = google_email
        mime_msg["To"] = to_email
        mime_msg["Subject"] = subject

        # Attach text body
        mime_msg.attach(MIMEText(body_text, "plain", "utf-8"))

        # Attach file if provided
        if attachment_bytes and attachment_filename:
            part = MIMEApplication(attachment_bytes, Name=attachment_filename)
            part["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
            mime_msg.attach(part)

        # Base64url-encode raw email bytes
        raw_bytes = mime_msg.as_bytes()
        raw_b64 = base64.urlsafe_b64encode(raw_bytes).decode("utf-8")

        # Execute Gmail API call
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        sent_response = service.users().messages().send(
            userId="me",
            body={"raw": raw_b64}
        ).execute()

        msg_id = sent_response.get("id", "OK")
        logger.info(f"Email sent via Gmail API for user {user_id} ({google_email}) to {to_email}. Message ID: {msg_id}")
        return True, f"Email delivered via your personal Gmail account ({google_email})", google_email

    except Exception as e:
        error_str = str(e)
        logger.error(f"Gmail API dispatch failed for user {user_id}: {error_str}")

        # Check for invalid grant / token revoked
        if "invalid_grant" in error_str.lower() or "token has been expired or revoked" in error_str.lower():
            with engine.connect() as conn:
                conn.execute(
                    text("""
                        UPDATE user_gmail_accounts
                        SET status = 'expired',
                            last_error = :err,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = :uid
                    """),
                    {"err": error_str, "uid": user_id}
                )
                conn.commit()
            return False, "Gmail authorization expired or revoked. Please reconnect your Gmail account in Settings.", google_email

        return False, f"Gmail dispatch error: {error_str}", google_email
