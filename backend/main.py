from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from routes import upload, forecast, analytics

app = FastAPI(title="BizVision API")

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(forecast.router, prefix="/api", tags=["forecast"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])

# Serve HTML pages (must come before static files mount)
@app.get("/")
def root():
    frontend_path = Path(__file__).parent.parent / "frontend" / "index.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"message": "BizVision API running"}

@app.get("/index.html")
def index_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "index.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Dashboard page not found"}

@app.get("/upload.html")
def upload_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "upload.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Upload page not found"}

@app.get("/forecast.html")
def forecast_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "forecast.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Forecast page not found"}

# Mount static files (CSS, JS) - MUST come after HTML routes
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")