import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Zap,
  Activity,
  Eye,
  CloudRain,
  Radio,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Flame,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { RawSensorFrame, DecisionExplanation } from '../types';
import {
  fetchActiveFaults,
  injectFault,
  clearFault,
  clearAllFaults,
} from '../services/api';

interface FaultInjectionLabPageProps {
  telemetry: RawSensorFrame | null;
  decision: DecisionExplanation | null;
}

interface FaultCardDef {
  key: string;
  name: string;
  category: 'ACS712' | 'MPU6050' | 'IR' | 'DHT11' | 'COMMS' | 'SYSTEM';
  description: string;
  expectedOutcome: string;
}

const FAULT_DEFINITIONS: FaultCardDef[] = [
  // ACS712 Current Sensor Faults
  {
    key: 'acs712_disconnected',
    name: 'ACS712 Disconnection',
    category: 'ACS712',
    description: 'Simulates physical disconnection of A1 wire; analog line floats to invalid ADC (0 or 1023).',
    expectedOutcome: 'Current marked DISCONNECTED; fallback to last known reading; degraded confidence.',
  },
  {
    key: 'acs712_noisy',
    name: 'ACS712 Heavy Electrical Noise',
    category: 'ACS712',
    description: 'Injects high-frequency Gaussian spikes (±0.45A) into the motor current channel.',
    expectedOutcome: 'Leaky persistence accumulator dampens noise spikes without triggering false alarms.',
  },
  {
    key: 'acs712_out_of_range',
    name: 'ACS712 Out-of-Range Surge',
    category: 'ACS712',
    description: 'Forces current reading to 3.85 A (exceeds 2.6 A hard limit).',
    expectedOutcome: 'Immediate overcurrent warning; emergency derate or protective trip triggered.',
  },

  // MPU6050 Motion Sensor Faults
  {
    key: 'mpu6050_disconnected',
    name: 'MPU6050 I²C Disconnection',
    category: 'MPU6050',
    description: 'Simulates loose header pin on A4/A5; I²C WHO_AM_I and data registers fail to ACK.',
    expectedOutcome: 'Vibration marked DISCONNECTED; system transitions to SENSOR_DEGRADED.',
  },
  {
    key: 'excessive_vibration',
    name: 'Excessive Mechanical Vibration',
    category: 'MPU6050',
    description: 'Simulates mechanical fan unbalance or rotor eccentricity: vibration RMS surges to 1.85 g.',
    expectedOutcome: 'Elevated Z-score triggers persistence accumulation; warning state with derate action.',
  },
  {
    key: 'mpu6050_noisy',
    name: 'MPU6050 Noisy Samples / Bit Flips',
    category: 'MPU6050',
    description: 'Injects sporadic invalid zero readings and erratic accelerometer values.',
    expectedOutcome: 'Gated filter rejects unphysical transient jerks; baseline updates freeze.',
  },

  // IR Stationary Obstacle Sensor Faults
  {
    key: 'ir_obstacle_detected',
    name: 'IR Object Proximity Detection',
    category: 'IR',
    description: 'Simulates object moved close to motor housing (D2 pulled LOW).',
    expectedOutcome: 'Stationary obstruction flag active; warning logged; safe operation inhibited.',
  },
  {
    key: 'ir_stuck_low',
    name: 'IR Sensor Stuck-LOW (Short to GND)',
    category: 'IR',
    description: 'Simulates damaged photodiode or short circuit permanently holding D2 at LOW.',
    expectedOutcome: 'Permanent obstacle detected; diagnostic warning to verify physical alignment.',
  },
  {
    key: 'ir_stuck_high',
    name: 'IR Sensor Stuck-HIGH (Open Circuit)',
    category: 'IR',
    description: 'Simulates disconnected IR data line (D2 permanently HIGH, never triggers).',
    expectedOutcome: 'Obstacle detection blinded; system flags absence of transition upon test dwell.',
  },

  // DHT11 Environmental Context Faults
  {
    key: 'dht11_disconnected',
    name: 'DHT11 Data Line Disconnection',
    category: 'DHT11',
    description: 'Simulates disconnected D4 single-wire bus; 80µs handshake times out.',
    expectedOutcome: 'Ambient context marked DEGRADED; conservative fixed thermal bounds applied.',
  },
  {
    key: 'dht11_invalid',
    name: 'DHT11 Corrupted Checksum Readings',
    category: 'DHT11',
    description: 'Simulates bit errors causing humidity >100% or temperature >80°C.',
    expectedOutcome: 'Parity validation rejects packet; last valid ambient context retained.',
  },

  // Communications & Transport Faults
  {
    key: 'serial_timeout',
    name: 'USB Serial Buffer Timeout',
    category: 'COMMS',
    description: 'Simulates frozen host COM port or blocked OS handle (>1.5s delay).',
    expectedOutcome: 'Telemetry age counter turns amber/red; connection flagged STALE.',
  },
  {
    key: 'bluetooth_disconnected',
    name: 'HC-05 Bluetooth Link Drop',
    category: 'COMMS',
    description: 'Simulates RF link loss between HC-05 (D11/D7) and laptop receiver.',
    expectedOutcome: 'Automatic fallback to simulation or safe idle; transport status shows DISCONNECTED.',
  },
  {
    key: 'malformed_telemetry',
    name: 'Malformed JSON Telemetry Frames',
    category: 'COMMS',
    description: 'Simulates baud rate mismatch or UART line garbage (missing closing braces, NaN values).',
    expectedOutcome: 'JSON framing parser increments corrupted_frames counter without crashing backend.',
  },
  {
    key: 'stale_readings',
    name: 'Stale Sensor Reading Freezes',
    category: 'COMMS',
    description: 'Simulates micro-controller loop hang; sequence numbers stop incrementing.',
    expectedOutcome: 'Stale detector flags frozen readings after 1000ms.',
  },

  // Compound & Recovery Scenarios
  {
    key: 'multiple_simultaneous_faults',
    name: 'Multiple Simultaneous Sensor Faults',
    category: 'SYSTEM',
    description: 'Simulates concurrent ACS712 disconnection + MPU6050 I²C bus crash.',
    expectedOutcome: 'Pairwise Contradiction Matrix identifies multi-channel failure; system locks to SAFE mode.',
  },
  {
    key: 'recovery_after_fault',
    name: 'Fault Recovery Verification',
    category: 'SYSTEM',
    description: 'Clears all active simulated faults and monitors consecutive valid samples.',
    expectedOutcome: 'Confidence score steadily recovers; state transitions back to NORMAL smoothly.',
  },
];

export const FaultInjectionLabPage: React.FC<FaultInjectionLabPageProps> = ({
  telemetry,
  decision,
}) => {
  const [activeFaults, setActiveFaults] = useState<string[]>([]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const loadActiveFaults = async () => {
    try {
      const res = await fetchActiveFaults();
      if (res && res.active_faults) {
        setActiveFaults(res.active_faults);
      } else if (res && res.faults) {
        const active = res.faults.filter((f: any) => f.is_active).map((f: any) => f.key);
        setActiveFaults(active);
      }
    } catch (e) {
      console.error('Failed to load active faults', e);
    }
  };

  useEffect(() => {
    loadActiveFaults();
    const interval = setInterval(loadActiveFaults, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleToggleFault = async (key: string) => {
    setLoadingKey(key);
    try {
      if (activeFaults.includes(key)) {
        await clearFault(key);
      } else {
        await injectFault(key);
      }
      await loadActiveFaults();
    } catch (e) {
      console.error('Error toggling fault', e);
    } finally {
      setLoadingKey(null);
    }
  };

  const handleClearAll = async () => {
    setLoadingKey('clear_all');
    try {
      await clearAllFaults();
      await loadActiveFaults();
    } catch (e) {
      console.error('Failed to clear all faults', e);
    } finally {
      setLoadingKey(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ACS712': return <Zap className="w-4 h-4 text-cyan-400" />;
      case 'MPU6050': return <Activity className="w-4 h-4 text-amber-400" />;
      case 'IR': return <Eye className="w-4 h-4 text-purple-400" />;
      case 'DHT11': return <CloudRain className="w-4 h-4 text-blue-400" />;
      case 'COMMS': return <Radio className="w-4 h-4 text-emerald-400" />;
      case 'SYSTEM': return <Layers className="w-4 h-4 text-rose-400" />;
      default: return <AlertTriangle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1E293B]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Fault Injection & Anomaly Verification Lab
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-600/40 text-amber-300 font-semibold">
              17 Reversible Scenarios
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Safely simulate sensor failures, electrical noise, physical obstructions, and communications degradation. All faults are fully reversible and labeled as SIMULATED.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleClearAll}
            disabled={activeFaults.length === 0}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeFaults.length > 0
                ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 shadow-md'
                : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear All Faults ({activeFaults.length})
          </button>
        </div>
      </div>

      {/* Live System State & Telemetry Provenance Banner */}
      <div className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${
            activeFaults.length > 0
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-400'
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
          }`}>
            {activeFaults.length > 0 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              Active Simulation Status:
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                activeFaults.length > 0
                  ? 'bg-amber-900/60 text-amber-200 border border-amber-700/50'
                  : 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50'
              }`}>
                {activeFaults.length > 0 ? `${activeFaults.length} FAULT(S) ACTIVE` : 'ALL CHANNELS NOMINAL'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
              <span>Data Provenance: <strong className="text-cyan-400">{telemetry?.source || 'REAL'}</strong></span>
              <span>System State: <strong className="text-amber-400">{decision?.state || 'NORMAL'}</strong></span>
              <span>Motor Commanded: <strong className="text-slate-200">{telemetry?.motor_pwm || 0} PWM</strong></span>
            </div>
          </div>
        </div>

        {activeFaults.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-w-md">
            {activeFaults.map((k) => (
              <span key={k} className="text-[10px] px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grid of 17 Fault Cards Grouped by Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FAULT_DEFINITIONS.map((f) => {
          const isActive = activeFaults.includes(f.key);
          const isLoading = loadingKey === f.key;

          return (
            <div
              key={f.key}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                isActive
                  ? 'bg-[#181124] border-rose-500/60 shadow-lg shadow-rose-950/20'
                  : 'bg-[#111827] border-[#1E293B] hover:border-slate-700'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl">
                  SIMULATED ACTIVE
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-[#131E35] border border-slate-800">
                    {getCategoryIcon(f.category)}
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {f.category}
                    </span>
                    <h3 className="text-xs font-bold text-slate-100">{f.name}</h3>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                  {f.description}
                </p>

                <div className="mt-3 p-2 rounded bg-[#0A0F1D] border border-[#1E293B] text-[10px] text-slate-400">
                  <span className="text-cyan-400 font-semibold">Expected Behavior: </span>
                  {f.expectedOutcome}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">key: {f.key}</span>
                <button
                  onClick={() => handleToggleFault(f.key)}
                  disabled={isLoading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-rose-900/60 hover:bg-rose-900 text-rose-200 border border-rose-500/50'
                      : 'bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  {isActive ? (
                    <>
                      <RotateCcw className="w-3 h-3" /> Clear Fault
                    </>
                  ) : (
                    <>
                      <Flame className="w-3 h-3 text-amber-400" /> Inject Fault
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
