import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# format: postgresql://username:password@host:port/dbname
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

if __name__ == "__main__":
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();"))
            print("Connected! PostgreSQL version:", result.fetchone())
    except Exception as e:
        print("Connection failed:", e)