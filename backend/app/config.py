from pydantic import BaseModel, Field
from typing import List
import os

class Settings(BaseModel):
    app_name: str = "SC-CAMV Engine"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8000
    
    # Serial / Hardware
    default_serial_port: str = "COM3"
    baud_rate: int = 9600
    serial_timeout_s: float = 1.0
    
    # Operation Mode: SIMULATION, LIVE_HARDWARE, REPLAY
    initial_mode: str = "SIMULATION"
    
    # Storage
    base_dir: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir: str = os.path.join(base_dir, "data")
    db_path: str = os.path.join(data_dir, "sc_camv.db")
    exports_dir: str = os.path.join(data_dir, "exports")
    samples_dir: str = os.path.join(data_dir, "samples", "synthetic")
    
    # CORS
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

settings = Settings()

# Ensure required directories exist
os.makedirs(settings.data_dir, exist_ok=True)
os.makedirs(settings.exports_dir, exist_ok=True)
os.makedirs(settings.samples_dir, exist_ok=True)
