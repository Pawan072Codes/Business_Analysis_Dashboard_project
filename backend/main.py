from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from database import init_db
from routes import analytics, auth, data, forecast, insights, kpi, upload

app = FastAPI(title="BizVision API")

def ensure_favicon():
    frontend_dir = Path(__file__).parent.parent / "frontend"
    ico_path = frontend_dir / "favicon.ico"
    if not ico_path.exists():
        try:
            from PIL import Image, ImageDraw
            def create_icon(size):
                img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
                draw = ImageDraw.Draw(img)
                radius = int(size * 0.22)
                draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(15, 23, 42, 255))
                draw.rounded_rectangle([1, 1, size - 2, size - 2], radius=radius, outline=(79, 70, 229, 180), width=max(1, int(size * 0.03)))
                pad = size * 0.16
                w = (size - 2 * pad) / 3.6
                gap = w * 0.3
                bars = [(0, 0.40, (59, 130, 246, 255)), (1, 0.62, (99, 102, 241, 255)), (2, 0.82, (20, 184, 166, 255))]
                bottom = size - pad * 1.1
                for idx, hr, col in bars:
                    x0 = pad + idx * (w + gap)
                    x1 = x0 + w
                    h = (size - 2 * pad) * hr
                    draw.rounded_rectangle([x0, bottom - h, x1, bottom], radius=max(1, int(w * 0.3)), fill=col)
                dot_r = max(2, int(size * 0.05))
                pk_x = pad + 2 * (w + gap) + w / 2
                pk_y = bottom - (size - 2 * pad) * 0.82 - dot_r * 1.5
                if pk_y > 3:
                    draw.ellipse([pk_x - dot_r, pk_y - dot_r, pk_x + dot_r, pk_y + dot_r], fill=(45, 212, 191, 255))
                return img
            sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
            icons = [create_icon(s[0]) for s in sizes]
            icons[0].save(str(ico_path), format="ICO", sizes=[(i.width, i.height) for i in icons], append_images=icons[1:])
        except Exception:
            pass

# Initialize DB tables on startup
@app.on_event("startup")
def on_startup():
    init_db()
    ensure_favicon()

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prevent stale browser caching during development (stops unwanted 304 on static/HTML assets)
@app.middleware("http")
async def add_no_cache_header_for_dev(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.endswith((".html", ".js", ".css")) or path.startswith(("/static", "/css", "/js")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Include API routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(forecast.router, prefix="/api", tags=["forecast"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])
app.include_router(data.router, prefix="/api", tags=["data"])
app.include_router(kpi.router, prefix="/api", tags=["kpi"])
app.include_router(insights.router, prefix="/api", tags=["insights"])

# Favicon routes (resolves GET /favicon.ico 404)
@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
def favicon():
    ensure_favicon()
    frontend_dir = Path(__file__).parent.parent / "frontend"
    ico_path = frontend_dir / "favicon.ico"
    if ico_path.exists():
        return FileResponse(str(ico_path), media_type="image/x-icon")
    svg_path = frontend_dir / "favicon.svg"
    if svg_path.exists():
        return FileResponse(str(svg_path), media_type="image/svg+xml")
    return Response(status_code=204)

# Serve HTML pages (must come before static files mount)
@app.get("/")
def root():
    frontend_path = Path(__file__).parent.parent / "frontend" / "index.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"message": "BizVision API running"}

@app.get("/login.html")
def login_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "login.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Login page not found"}

@app.get("/signup.html")
def signup_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "signup.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Signup page not found"}

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

@app.get("/compare.html")
def compare_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "compare.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Compare page not found"}

@app.get("/insights.html")
def insights_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "insights.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Insights page not found"}

@app.get("/reports.html")
def reports_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "reports.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Reports page not found"}

@app.get("/profile.html")
def profile_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "profile.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Profile page not found"}

@app.get("/settings.html")
def settings_page():
    frontend_path = Path(__file__).parent.parent / "frontend" / "settings.html"
    if frontend_path.exists():
        return FileResponse(str(frontend_path), media_type="text/html")
    return {"error": "Settings page not found"}

# Mount static files (CSS, JS) - MUST come after HTML routes
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")
    if (frontend_path / "css").exists():
        app.mount("/css", StaticFiles(directory=str(frontend_path / "css")), name="css")
    if (frontend_path / "js").exists():
        app.mount("/js", StaticFiles(directory=str(frontend_path / "js")), name="js")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)


