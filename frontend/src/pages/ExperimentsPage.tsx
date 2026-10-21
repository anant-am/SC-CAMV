import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Play,
  Square,
  FileText,
  Download,
  CheckCircle,
  AlertTriangle,
  History,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { RawSensorFrame, DecisionExplanation } from '../types';
import { runScenario } from '../services/api';

interface ExperimentsPageProps {
  telemetry: RawSensorFrame | null;
  decision: DecisionExplanation | null;
}

interface ExperimentProtocol {
  id: string;
  name: string;
  objective: string;
  scenarioKey: string;
  expectedState: string;
  expectedAction: string;
  safetyNotes: string;
}

const EXPERIMENT_PROTOCOLS: ExperimentProtocol[] = [
  {
    id: 'EXP-A',
    name: 'Experiment A: Healthy Baseline Equilibrium',
    objective: 'Validate that the motor runs at steady state (~47°C casing, 1.08A, 1360 RPM) with 0 false alarms.',
    scenarioKey: 'healthy_baseline',
    expectedState: 'NORMAL',
    expectedAction: 'NONE',
    safetyNotes: 'Motor free-running at nominal 12V DC.',
  },
  {
    id: 'EXP-B',
    name: 'Experiment B: Isolated Thermal Disturbance',
    objective: 'Test casing temperature rise without corroborating current or vibration increase.',
    scenarioKey: 'gradual_thermal_rise',
    expectedState: 'WARNING',
    expectedAction: 'DERATE_PWM_60',
    safetyNotes: 'Do not use open flames; simulate thermal accumulation.',
  },
  {
    id: 'EXP-C',
    name: 'Experiment C: Mechanical Disturbance (Eccentric Vibration)',
    objective: 'Simulate mechanical rotor unbalance and verify MPU6050 vibration metric triggers warning.',
    scenarioKey: 'eccentric_vibration',
    expectedState: 'WARNING',
    expectedAction: 'DERATE_PWM_60',
    safetyNotes: 'Secure motor mounting rigorously before physical trial.',
  },
  {
    id: 'EXP-D',
    name: 'Experiment D: Increased Load & Obstruction',
    objective: 'Simulate high mechanical load: current rises (>2.0A) while motor RPM falls sharply.',
    scenarioKey: 'mechanical_overload',
    expectedState: 'HIGH_RISK / CRITICAL',
    expectedAction: 'DERATE_PWM_30 / EMERGENCY_SHUTDOWN',
    safetyNotes: 'Current limit L298N driver to avoid overheating motor coils.',
  },
  {
    id: 'EXP-E',
    name: 'Experiment E: Conflicting Evidence (Ambient Heatwave)',
    objective: 'Demonstrate contradiction discount: rising ambient temp explains motor temp rise; NO false shutdown.',
    scenarioKey: 'ambient_heatwave_contradiction',
    expectedState: 'WATCH (or NORMAL)',
    expectedAction: 'OBSERVE_LOG',
    safetyNotes: 'Validates academic novelty: prevents unwarranted production trip.',
  },
  {
    id: 'EXP-F',
    name: 'Experiment F: Atmospheric Pressure Variation',
    objective: 'Verify barometric pressure shift (BMP180) is treated as context and rejected as a motor fault indicator.',
    scenarioKey: 'context_pressure_change',
    expectedState: 'NORMAL',
    expectedAction: 'NONE',
    safetyNotes: 'BMP180 is strictly environmental context.',
  },
  {
    id: 'EXP-G',
    name: 'Experiment G: Sensor Dropout & Stale Signal',
    objective: 'Simulate disconnection of ACS712 current sensor; verify transition to SENSOR_DEGRADED state.',
    scenarioKey: 'sensor_dropout',
    expectedState: 'SENSOR_DEGRADED',
    expectedAction: 'OBSERVE_LOG',
    safetyNotes: 'Checks that missing data does not trigger a false catastrophic alarm.',
  },
  {
    id: 'EXP-H',
    name: 'Experiment H: Telemetry Communication Loss',
    objective: 'Verify embedded Arduino UNO watchdog continues local protective monitoring even if serial halts.',
    scenarioKey: 'sensor_noise_outliers',
    expectedState: 'NORMAL / WATCH',
    expectedAction: 'NONE',
    safetyNotes: 'Local Arduino protection must never depend on the PC backend.',
  },
  {
    id: 'EXP-I',
    name: 'Experiment I: Multi-Modal Combined Overload',
    objective: 'Simulate concurrent temperature, current, vibration surge with RPM collapse; confirm immediate shutdown.',
    scenarioKey: 'catastrophic_combined',
    expectedState: 'CRITICAL',
    expectedAction: 'EMERGENCY_SHUTDOWN',
    safetyNotes: 'Immediate motor stop to prevent physical damage.',
  },
  {
    id: 'EXP-J',
    name: 'Experiment J: 3-Strike Lockout & Recovery Probation',
    objective: 'Trigger 3 consecutive critical trips within probation window to verify HARD_LOCKOUT prevents auto-restart.',
    scenarioKey: 'recovery_bounce',
    expectedState: 'HARD_LOCKOUT',
    expectedAction: 'MANUAL_RESET_REQUIRED',
    safetyNotes: 'Requires explicit operator reset on Topbar to clear lockout.',
  },
];

export const ExperimentsPage: React.FC<ExperimentsPageProps> = ({ telemetry, decision }) => {
  const [selectedExp, setSelectedExp] = useState<ExperimentProtocol>(EXPERIMENT_PROTOCOLS[0]);
  const [isTrialRunning, setIsTrialRunning] = useState<boolean>(false);
  const [operatorNotes, setOperatorNotes] = useState<string>('Standard room temperature trial. Bench supply set to 12.0V DC.');
  const [trialLog, setTrialLog] = useState<Array<{ id: string; name: string; timestamp: string; state: string; risk: number }>>([
    { id: 'EXP-A', name: 'Baseline Trial 1', timestamp: '2026-10-19 20:30:12', state: 'NORMAL', risk: 8.4 },
    { id: 'EXP-E', name: 'Heatwave Trial 1', timestamp: '2026-10-19 20:35:45', state: 'WATCH', risk: 28.1 },
    { id: 'EXP-D', name: 'Stall Overload 1', timestamp: '2026-10-19 20:41:20', state: 'CRITICAL', risk: 89.6 },
  ]);

  const handleStartTrial = async (exp: ExperimentProtocol) => {
    setSelectedExp(exp);
    setIsTrialRunning(true);
    try {
      await runScenario(exp.scenarioKey);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopTrial = () => {
    setIsTrialRunning(false);
    if (decision) {
      setTrialLog((prev) => [
        {
          id: selectedExp.id,
          name: selectedExp.name,
          timestamp: new Date().toLocaleTimeString(),
          state: decision.state,
          risk: decision.risk_score,
        },
        ...prev,
      ]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <SlidersHorizontal className="w-4 h-4" />
            Formal Experimental Protocol Runner
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            Hardware-in-the-Loop Experimentation Protocol
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Ten controlled experimental protocols (Experiments A through J) validating baseline stability,
            single-sensor anomalies, multi-sensor corroboration, contradiction handling, and lockout protection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/api/v1/export/telemetry.csv"
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#070D18] hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
          >
            <Download className="w-4 h-4 text-cyan-400" /> Export Telemetry CSV
          </a>
          <a
            href="/api/v1/export/decisions.csv"
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#070D18] hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
          >
            <Download className="w-4 h-4 text-cyan-400" /> Export Decisions CSV
          </a>
        </div>
      </div>

      {/* Main Execution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Protocol Details & Active Controls */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                {selectedExp.id} Configuration
              </span>
              <span className="text-xs font-mono text-slate-400">
                Target: <span className="text-slate-200 font-semibold">{selectedExp.expectedState}</span>
              </span>
            </div>

            <h2 className="text-base font-bold text-slate-100">{selectedExp.name}</h2>
            <p className="text-xs text-slate-300 leading-relaxed">{selectedExp.objective}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Expected Protective Action</div>
                <div className="text-xs font-bold font-mono text-cyan-300 mt-1">{selectedExp.expectedAction}</div>
              </div>
              <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Safety & Physical Constraints</div>
                <div className="text-xs text-slate-300 mt-1">{selectedExp.safetyNotes}</div>
              </div>
            </div>

            {/* Operator Notes Field */}
            <div className="pt-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase">
                Operator Experiment Notes
              </label>
              <textarea
                value={operatorNotes}
                onChange={(e) => setOperatorNotes(e.target.value)}
                className="w-full mt-1.5 p-2.5 rounded-lg bg-[#070D18] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                rows={2}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-[#1E293B]">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Live Status:</span>
                <span className="font-bold text-slate-200">{decision?.state || 'NORMAL'}</span>
                <span className="text-slate-500 font-mono">({decision?.risk_score.toFixed(1)}/100)</span>
              </div>

              <div className="flex items-center gap-2.5">
                {!isTrialRunning ? (
                  <button
                    onClick={() => handleStartTrial(selectedExp)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    <Play className="w-4 h-4" /> Start Trial
                  </button>
                ) : (
                  <button
                    onClick={handleStopTrial}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    <Square className="w-4 h-4" /> Stop & Log Trial
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Protocol List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Standardized Experiment Protocols (A through J)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EXPERIMENT_PROTOCOLS.map((exp) => {
                const isSelected = exp.id === selectedExp.id;
                return (
                  <div
                    key={exp.id}
                    onClick={() => setSelectedExp(exp)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500 shadow-md ring-1 ring-cyan-500/40'
                        : 'bg-[#0F172A] border-[#1E293B] hover:border-slate-600 hover:bg-[#131D33]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-200">{exp.id}</span>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                        {exp.expectedState}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-300 truncate">{exp.name}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">{exp.objective}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Col: Trial History Log */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-400" />
              Trial Execution History
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">{trialLog.length} runs</span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[600px] pr-1">
            {trialLog.map((log, i) => (
              <div key={i} className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300">{log.id}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                </div>
                <div className="text-xs text-slate-200 truncate">{log.name}</div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                  <span className="text-slate-400">Observed State:</span>
                  <span className="font-semibold text-emerald-400">{log.state}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Risk Score:</span>
                  <span className="font-mono text-slate-300">{log.risk.toFixed(1)}/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
