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
    try:
        with engine.connect() as conn:
            conn.execute(text(create_users_table))
            conn.execute(text(create_datasets_table))
            conn.commit()
            print("Database tables 'users' and 'datasets' initialized successfully.")
    except Exception as e:
        print("Database initialization warning/error:", e)

if __name__ == "__main__":
    init_db()