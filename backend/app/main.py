from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from backend.app.config import settings
from backend.app.core.engine import engine
from backend.app.core.websocket_manager import ws_hub
from backend.app.api import (
    health,
    telemetry,
    algorithm,
    scenarios,
    calibration,
    hardware,
    evaluation,
    export,
    faults,
    motor,
    events,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SC-CAMV")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch background monitoring/simulation engine
    logger.info("Initializing SC-CAMV backend engine...")
    loop_task = asyncio.create_task(engine.start_loop())
    yield
    # Shutdown: gracefully stop engine loop and serial port
    logger.info("Shutting down SC-CAMV backend engine...")
    engine.stop_loop()
    loop_task.cancel()
    try:
        await loop_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Self-Calibrating Multifactor Health and Adaptive Protection Framework for Intelligent Devices",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all local frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(health.router, prefix="/api/v1")
app.include_router(telemetry.router, prefix="/api/v1")
app.include_router(motor.router, prefix="/api/v1")
app.include_router(faults.router, prefix="/api/v1")
app.include_router(algorithm.router, prefix="/api/v1")
app.include_router(scenarios.router, prefix="/api/v1")
app.include_router(calibration.router, prefix="/api/v1")
app.include_router(hardware.router, prefix="/api/v1")
app.include_router(evaluation.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_hub.connect(websocket)
    try:
        while True:
            # Keep connection alive and accept any client messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_hub.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        ws_hub.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.host, port=settings.port, reload=True)
