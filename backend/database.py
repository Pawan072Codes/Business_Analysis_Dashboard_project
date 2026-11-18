import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# format: postgresql://username:password@host:port/dbname
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

def init_db():
    create_users_table = """
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_datasets_table = """
    CREATE TABLE IF NOT EXISTS datasets (
        id SERIAL PRIMARY KEY,
        dataset_id VARCHAR(255) UNIQUE NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_insights_cache_table = """
    CREATE TABLE IF NOT EXISTS insights_cache (
        id SERIAL PRIMARY KEY,
        dataset_id VARCHAR(255) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_sessions_table = """
    CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_gmail_accounts_table = """
    CREATE TABLE IF NOT EXISTS user_gmail_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        google_email VARCHAR(255) NOT NULL,
        encrypted_access_token TEXT,
        encrypted_refresh_token TEXT NOT NULL,
        token_expiry TIMESTAMP,
        scope TEXT,
        status VARCHAR(50) DEFAULT 'connected',
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    create_oauth_states_table = """
    CREATE TABLE IF NOT EXISTS user_oauth_states (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        state_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(create_users_table))
            conn.execute(text(create_datasets_table))
            conn.execute(text(create_insights_cache_table))
            conn.execute(text(create_sessions_table))
            conn.execute(text(create_gmail_accounts_table))
            conn.execute(text(create_oauth_states_table))
            conn.commit()
            print("Database tables 'users', 'datasets', 'insights_cache', 'user_sessions', 'user_gmail_accounts', and 'user_oauth_states' initialized successfully.")
    except Exception as e:
        print("Database initialization warning/error:", e)

if __name__ == "__main__":
    init_db()
