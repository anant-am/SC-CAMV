import sqlite3
import json
import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

from backend.app.config import settings
from backend.app.schemas.telemetry import (
    RawSensorFrame,
    DecisionExplanation,
    CalibrationProfile,
    SystemState,
    ProtectiveAction,
    SensorDataSource,
    MotorState,
)

logger = logging.getLogger("DatabaseManager")

class DatabaseManager:
    def __init__(self, db_path: str = settings.db_path):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self._init_tables()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_tables(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Telemetry History Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp_ms INTEGER NOT NULL,
                    sequence_id INTEGER NOT NULL,
                    current_a REAL,
                    current_raw_adc INTEGER,
                    current_v REAL,
                    vibe_g REAL,
                    ax REAL,
                    ay REAL,
                    az REAL,
                    ir_object_detected INTEGER DEFAULT 0,
                    ir_raw_state INTEGER DEFAULT 1,
                    amb_temp_c REAL,
                    amb_hum_pct REAL,
                    motor_pwm INTEGER DEFAULT 0,
                    commanded_state TEXT DEFAULT 'STOPPED',
                    inferred_state TEXT DEFAULT 'STOPPED',
                    source TEXT DEFAULT 'SIMULATED',
                    is_simulated INTEGER DEFAULT 1,
                    active_faults_json TEXT
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_history(timestamp_ms)
            """)

            # Ensure any missing columns exist on existing databases
            cursor.execute("PRAGMA table_info(telemetry_history)")
            existing_cols = {row["name"] for row in cursor.fetchall()}
            needed_cols = {
                "current_raw_adc": "INTEGER",
                "current_v": "REAL",
                "ax": "REAL",
                "ay": "REAL",
                "az": "REAL",
                "ir_object_detected": "INTEGER DEFAULT 0",
                "ir_raw_state": "INTEGER DEFAULT 1",
                "commanded_state": "TEXT DEFAULT 'STOPPED'",
                "inferred_state": "TEXT DEFAULT 'STOPPED'",
                "source": "TEXT DEFAULT 'SIMULATED'",
                "active_faults_json": "TEXT",
            }
            for col_name, col_type in needed_cols.items():
                if col_name not in existing_cols:
                    try:
                        cursor.execute(f"ALTER TABLE telemetry_history ADD COLUMN {col_name} {col_type}")
                    except Exception as e:
                        logger.warning(f"Column add {col_name}: {e}")

            # Decision & State Transitions Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS decision_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp_ms INTEGER NOT NULL,
                    timestamp_iso TEXT NOT NULL,
                    state TEXT NOT NULL,
                    risk_score REAL NOT NULL,
                    confidence REAL NOT NULL,
                    raw_evidence REAL,
                    action_requested TEXT NOT NULL,
                    action_executed INTEGER DEFAULT 1,
                    rules_json TEXT,
                    supporting_json TEXT,
                    contradictory_json TEXT,
                    baseline_version INTEGER,
                    is_simulated INTEGER DEFAULT 0
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_decisions_time ON decision_events(timestamp_ms)
            """)

            # Calibration Profiles Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS calibration_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    version INTEGER NOT NULL,
                    created_at_iso TEXT NOT NULL,
                    sample_count INTEGER NOT NULL,
                    is_valid INTEGER NOT NULL,
                    rejection_reason TEXT,
                    stats_json TEXT NOT NULL
                )
            """)

            # System Event Audit Log Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp_ms INTEGER NOT NULL,
                    timestamp_iso TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    subsystem TEXT NOT NULL,
                    message TEXT NOT NULL,
                    source TEXT NOT NULL,
                    is_fault_active INTEGER DEFAULT 0,
                    metadata_json TEXT
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_system_events_time ON system_events(timestamp_ms)
            """)

            conn.commit()

    def insert_telemetry(self, frame: RawSensorFrame):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO telemetry_history (
                    timestamp_ms, sequence_id, current_a, current_raw_adc, current_v,
                    vibe_g, ax, ay, az, ir_object_detected, ir_raw_state,
                    amb_temp_c, amb_hum_pct, motor_pwm, commanded_state,
                    inferred_state, source, is_simulated, active_faults_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                frame.timestamp_ms,
                frame.sequence_id,
                frame.current_a,
                frame.current_raw_adc,
                frame.current_v,
                frame.vibe_g,
                frame.ax,
                frame.ay,
                frame.az,
                1 if frame.ir_object_detected else 0,
                frame.ir_raw_state,
                frame.amb_temp_c,
                frame.amb_hum_pct,
                frame.motor_pwm,
                frame.commanded_motor_state.value if hasattr(frame.commanded_motor_state, "value") else str(frame.commanded_motor_state),
                frame.inferred_motor_state.value if hasattr(frame.inferred_motor_state, "value") else str(frame.inferred_motor_state),
                frame.source.value if hasattr(frame.source, "value") else str(frame.source),
                1 if frame.is_simulated else 0,
                json.dumps(frame.active_faults),
            ))
            conn.commit()

    def insert_decision(self, decision: DecisionExplanation):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO decision_events (
                    timestamp_ms, timestamp_iso, state, risk_score, confidence,
                    raw_evidence, action_requested, action_executed, rules_json,
                    supporting_json, contradictory_json, baseline_version, is_simulated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                decision.timestamp_ms,
                decision.timestamp_iso,
                decision.state.value if hasattr(decision.state, "value") else str(decision.state),
                decision.risk_score,
                decision.confidence,
                decision.raw_evidence_score,
                decision.action_requested.value if hasattr(decision.action_requested, "value") else str(decision.action_requested),
                1 if decision.action_executed else 0,
                json.dumps(decision.rules_triggered),
                json.dumps([e.model_dump() for e in decision.supporting_evidence]),
                json.dumps([e.model_dump() for e in decision.contradictory_evidence]),
                decision.baseline_version,
                1 if decision.is_simulated_action else 0,
            ))
            conn.commit()

    def log_event(
        self,
        severity: str,
        subsystem: str,
        message: str,
        source: str = "REAL",
        is_fault_active: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO system_events (
                    timestamp_ms, timestamp_iso, severity, subsystem,
                    message, source, is_fault_active, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                now_ms,
                now_iso,
                severity,
                subsystem,
                message,
                source,
                1 if is_fault_active else 0,
                json.dumps(metadata or {}),
            ))
            conn.commit()

    def get_recent_telemetry(self, limit: int = 150) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM telemetry_history ORDER BY id DESC LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(r) for r in reversed(rows)]

    def get_recent_decisions(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM decision_events ORDER BY id DESC LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(r) for r in reversed(rows)]

    def get_recent_events(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM system_events ORDER BY id DESC LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def insert_calibration(self, profile: CalibrationProfile):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO calibration_profiles (
                    version, created_at_iso, sample_count, is_valid,
                    rejection_reason, stats_json
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                profile.version,
                profile.created_at_iso,
                profile.sample_count,
                1 if profile.is_valid else 0,
                profile.rejection_reason,
                json.dumps(profile.model_dump()),
            ))
            conn.commit()

    def get_latest_calibration(self) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT stats_json FROM calibration_profiles WHERE is_valid = 1 ORDER BY id DESC LIMIT 1
            """)
            row = cursor.fetchone()
            if row:
                return json.loads(row["stats_json"])
            return None

db_manager = DatabaseManager()
