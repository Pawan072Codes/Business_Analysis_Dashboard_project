import uuid
import bcrypt
from fastapi import APIRouter, HTTPException, Depends, Header, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

router = APIRouter()
security = HTTPBearer(auto_error=False)

# In-memory session cache: session_token -> user_dict
ACTIVE_SESSIONS = {}

def ensure_sessions_table():
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    token VARCHAR(255) PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.commit()
    except Exception as e:
        print("ensure_sessions_table warning:", e)

ensure_sessions_table()


class UserSignup(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


# Helper dependency to authenticate requests via session token
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    x_session_token: str = Header(default=None)
):
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    elif x_session_token:
        token = x_session_token

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session. Please log in."
        )

    # 1. Fast in-memory lookup
    if token in ACTIVE_SESSIONS:
        return ACTIVE_SESSIONS[token]

    # 2. Database lookup (persists session across server restarts / reloads)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT u.id, u.username, u.email
                    FROM user_sessions s
                    JOIN users u ON s.user_id = u.id
                    WHERE s.token = :token
                """),
                {"token": token}
            ).fetchone()

            if row:
                user_info = {
                    "id": row[0],
                    "username": row[1],
                    "email": row[2]
                }
                # Restore into memory cache
                ACTIVE_SESSIONS[token] = user_info
                return user_info
    except Exception:
        pass

    # 3. Not found in memory or database -> unauthenticated
    raise HTTPException(
        status_code=401,
        detail="Invalid or expired session. Please log in."
    )


@router.post("/signup")
def signup(data: UserSignup):
    """
    Creates a new user with a hashed password.

    WHY WE NEVER STORE PLAIN TEXT PASSWORDS:
    If a database is compromised, plain-text passwords expose users to account takeover
    across all websites where they reuse the same password. Using salted bcrypt hashes
    ensures passwords are non-reversible and immune to rainbow-table lookup attacks.
    """
    username = data.username.strip()
    email = data.email.strip().lower()
    password = data.password

    if not username or not email or not password:
        raise HTTPException(status_code=400, detail="Username, email, and password are required")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    # Check for existing user
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM users WHERE username = :u OR email = :e"),
            {"u": username, "e": email}
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=400,
                detail="Username or email is already registered"
            )

        # Hash password securely using bcrypt
        hashed_bytes = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
        hashed_password = hashed_bytes.decode("utf-8")

        # Insert user into PostgreSQL
        result = conn.execute(
            text("""
                INSERT INTO users (username, email, hashed_password)
                VALUES (:u, :e, :h)
                RETURNING id, created_at
            """),
            {"u": username, "e": email, "h": hashed_password}
        )
        conn.commit()
        user_row = result.fetchone()
        user_id = user_row[0]

    return {
        "success": True,
        "message": "Account created successfully",
        "user": {
            "id": user_id,
            "username": username,
            "email": email
        }
    }


@router.post("/login")
def login(data: UserLogin):
    """
    Verifies username and password hash, and issues a session token.
    """
    username = data.username.strip()
    password = data.password

    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, username, email, hashed_password FROM users WHERE username = :u"),
            {"u": username}
        ).fetchone()

        if not result:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        user_id, db_username, db_email, db_hashed = result

        # Check bcrypt password signature
        if not bcrypt.checkpw(password.encode("utf-8"), db_hashed.encode("utf-8")):
            raise HTTPException(status_code=401, detail="Invalid username or password")

    # Issue a secure session token
    token = uuid.uuid4().hex
    user_info = {
        "id": user_id,
        "username": db_username,
        "email": db_email
    }
    ACTIVE_SESSIONS[token] = user_info

    # Persist session to PostgreSQL to survive server reloads
    try:
        with engine.connect() as conn:
            conn.execute(
                text("INSERT INTO user_sessions (token, user_id) VALUES (:t, :u) ON CONFLICT (token) DO NOTHING"),
                {"t": token, "u": user_id}
            )
            conn.commit()
    except Exception:
        pass

    # Count user datasets to determine returning vs new onboarding flow
    dataset_count = 0
    try:
        with engine.connect() as conn:
            cnt = conn.execute(
                text("SELECT COUNT(*) FROM datasets WHERE user_id = :uid"),
                {"uid": user_id}
            ).scalar()
            dataset_count = int(cnt) if cnt else 0
    except Exception:
        pass

    return {
        "success": True,
        "message": "Login successful",
        "token": token,
        "user": user_info,
        "dataset_count": dataset_count
    }


@router.get("/me")
def get_user_profile(current_user: dict = Depends(get_current_user)):
    return {"success": True, "user": current_user}


@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials = Security(security), x_session_token: str = Header(default=None)):
    token = credentials.credentials if (credentials and credentials.credentials) else x_session_token
    if token:
        if token in ACTIVE_SESSIONS:
            del ACTIVE_SESSIONS[token]
        try:
            with engine.connect() as conn:
                conn.execute(text("DELETE FROM user_sessions WHERE token = :t"), {"t": token})
                conn.commit()
        except Exception:
            pass
    return {"success": True, "message": "Logged out successfully"}
