export type SystemState = 
  | 'NORMAL'
  | 'WATCH'
  | 'WARNING'
  | 'HIGH_RISK'
  | 'CRITICAL'
  | 'SENSOR_DEGRADED'
  | 'CALIBRATING'
  | 'RECOVERY_CHECK'
  | 'HARD_LOCKOUT';

export type ProtectiveAction =
  | 'NONE'
  | 'OBSERVE_LOG'
  | 'DERATE_PWM_60'
  | 'DERATE_PWM_30'
  | 'EMERGENCY_SHUTDOWN'
  | 'RAMP_PROBATION'
  | 'MANUAL_RESET_REQUIRED';

export type SensorDataSource = 'REAL' | 'FALLBACK' | 'SIMULATED';

export type MotorState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'FAULT' | 'UNKNOWN';

export interface RawSensorFrame {
  sequence_id: number;
  timestamp_ms: number;
  current_a: number | null;
  current_raw_adc?: number | null;
  current_v?: number | null;
  vibe_g: number | null;
  ax?: number | null;
  ay?: number | null;
  az?: number | null;
  gx?: number | null;
  gy?: number | null;
  gz?: number | null;
  ir_object_detected?: boolean;
  ir_raw_state?: number;
  amb_temp_c: number | null;
  amb_hum_pct: number | null;
  lm35_temp_c?: number | null;
  fused_temp_c?: number | null;
  temp_source?: string;
  temp_valid?: boolean;
  motor_pwm: number;
  commanded_motor_state?: MotorState;
  inferred_motor_state?: MotorState;
  source?: SensorDataSource;
  is_simulated: boolean;
  sensor_statuses?: Record<string, string>;
  active_faults?: string[];
}

export interface SensorValidationResult {
  sensor_name: string;
  status: 'VALID' | 'OUT_OF_BOUNDS' | 'STALE' | 'DISCONNECTED' | 'RATE_EXCEEDED';
  value: number | null;
  bounds_min: number;
  bounds_max: number;
  reason?: string;
  age_ms: number;
}

export interface EvidenceItem {
  sensor_name: string;
  deviation_z: number;
  persistence_p: number;
  weight: number;
  direction: 'HIGH' | 'LOW' | 'NEUTRAL' | 'CONTRADICTION';
  description: string;
}

export interface DecisionExplanation {
  timestamp_iso: string;
  timestamp_ms: number;
  state: SystemState;
  risk_score: number;
  confidence: number;
  raw_evidence_score: number;
  supporting_evidence: EvidenceItem[];
  contradictory_evidence: EvidenceItem[];
  neutral_evidence: EvidenceItem[];
  sensor_quality_issues: SensorValidationResult[];
  rules_triggered: string[];
  action_requested: ProtectiveAction;
  action_executed: boolean;
  is_simulated_action: boolean;
  baseline_version: number;
  recovery_attempts: number;
  lockout_active: boolean;
}

export interface ScenarioDefinition {
  key: string;
  title: string;
  description: string;
  duration_steps: number;
  seed: number;
}

export interface HardwarePort {
  port: string;
  description: string;
  hwid: string;
  is_bluetooth: boolean;
}

export interface CalibrationStats {
  sensor_name: string;
  mean: number;
  std_dev: number;
  sample_count: number;
  min_val: number;
  max_val: number;
  last_updated_iso: string;
}

export interface CalibrationInfo {
  is_calibrated: boolean;
  version: number;
  normal_dwell_s: number;
  h_min_dwell_s: number;
  is_gate_open: boolean;
  alpha_calib: number;
  baseline: Record<string, { mean: number; variance: number; count: number; min: number; max: number }>;
}

export interface BenchmarkMetrics {
  total_scenarios_evaluated: number;
  false_alarms: number;
  false_alarm_rate_pct: number;
  correct_detections: number;
  detection_rate_pct: number;
  missed_detections: number;
  avg_detection_latency_s: number;
  heatwave_resilience: string;
  contradiction_awareness: boolean;
}

export interface SystemEvent {
  id?: number;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'RECOVERY';
  subsystem: string;
  message: string;
  source: string;
  active_faults?: string;
  details?: Record<string, any>;
}

export interface FaultDefinition {
  key: string;
  name: string;
  category: 'ACS712' | 'MPU6050' | 'IR' | 'DHT11' | 'COMMS' | 'SYSTEM';
  description: string;
}
