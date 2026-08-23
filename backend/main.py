from fastapi import FastAPI
from routes import upload

app = FastAPI(title="BizVision API")

app.include_router(upload.router, prefix="/api", tags=["upload"])

@app.get("/")
def root():
    return {"message": "BizVision API running"}