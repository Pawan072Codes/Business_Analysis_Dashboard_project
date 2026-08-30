from fastapi import FastAPI
from routes import upload
from routes import upload, forecast

app = FastAPI(title="BizVision API")

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(forecast.router, prefix="/api", tags=["forecast"])

@app.get("/")
def root():
    return {"message": "BizVision API running"}