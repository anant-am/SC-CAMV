import React, { useEffect, useState } from 'react';
import {
  Gauge,
  Lock,
  Unlock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Layers,
  Sparkles,
  Info,
  Zap,
  Sliders,
} from 'lucide-react';
import { CalibrationInfo } from '../types';
import {
  fetchCalibrationCurrent,
  triggerCalibration,
  calibrateACS712,
  calibrateMPU6050,
  triggerZeroDwell,
  resetBaselines,
} from '../services/api';

export const CalibrationPage: React.FC = () => {
  const [calibInfo, setCalibInfo] = useState<CalibrationInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null);

  // ACS712 Wizard state
  const [zeroCurrentV, setZeroCurrentV] = useState<number>(2.508);
  const [currentSens, setCurrentSens] = useState<number>(0.066);
  const [acsCalibResult, setAcsCalibResult] = useState<string | null>(null);

  // MPU6050 Wizard state
  const [gravityZ, setGravityZ] = useState<number>(-1.00);
  const [mpuCalibResult, setMpuCalibResult] = useState<string | null>(null);

  const loadCalibration = async () => {
    try {
      const data = await fetchCalibrationCurrent();
      setCalibInfo(data);
    } catch (err) {
      console.error('Failed to load calibration info', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalibration();
    const interval = setInterval(loadCalibration, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async () => {
    setTriggerStatus('Collecting healthy telemetry window...');
    try {
      const res = await triggerCalibration();
      setTriggerStatus(`Calibration accepted! Version updated to v${res.version}.`);
      await loadCalibration();
    } catch (err: any) {
      setTriggerStatus(`Calibration rejected: ${err.message || 'Window failed stability checks.'}`);
    }
  };

  const handleCalibrateACS = async () => {
    try {
      const res = await calibrateACS712(zeroCurrentV, currentSens);
      setAcsCalibResult(`ACS712 Calibrated: Zero Offset = ${res.zero_current_v.toFixed(3)}V, Sens = ${res.sensitivity_v_per_a}V/A`);
      await loadCalibration();
    } catch (err: any) {
      setAcsCalibResult(`Failed: ${err.message}`);
    }
  };

  const handleCalibrateMPU = async () => {
    try {
      const res = await calibrateMPU6050(gravityZ);
      setMpuCalibResult(`MPU6050 Calibrated: Reference Gravity Az = ${res.stationary_gravity_z.toFixed(2)}g (Upside Down)`);
      await loadCalibration();
    } catch (err: any) {
      setMpuCalibResult(`Failed: ${err.message}`);
    }
  };

  const isGateOpen = calibInfo?.is_gate_open ?? false;
  const dwellProgress = calibInfo
    ? Math.min(100, Math.round((calibInfo.normal_dwell_s / calibInfo.h_min_dwell_s) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Gauge className="w-4 h-4" />
            Gated Welford Self-Calibration Engine
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            Autonomous Baseline Learning & Contamination Guard
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Online baseline mean (&mu;) and standard deviation (&sigma;) are continuously tracked using Welford's algorithm.
            A temporal dwell gate (H_min = 5.0s) strictly prevents anomalous or unverified motor data from poisoning the healthy baseline.
          </p>
        </div>

        <button
          onClick={handleTrigger}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
        >
          <RotateCcw className="w-4 h-4" /> Recalibrate Baseline Now
        </button>
      </div>

      {triggerStatus && (
        <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
          triggerStatus.includes('accepted')
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
            : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
        }`}>
          <Info className="w-4 h-4 shrink-0" />
          <span>{triggerStatus}</span>
        </div>
      )}

      {/* Dwell Gate & Gate Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Gate Card */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Dwell Gate State
            </span>
            {isGateOpen ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                <Unlock className="w-3 h-3" /> OPEN (Learning)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                <Lock className="w-3 h-3" /> LOCKED (Dwell / Anomaly)
              </span>
            )}
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1 text-slate-400">
              <span>Healthy Dwell:</span>
              <span className="font-mono text-cyan-300">
                {calibInfo?.normal_dwell_s?.toFixed(1) || 0}s / {calibInfo?.h_min_dwell_s || 5.0}s
              </span>
            </div>
            <div className="w-full bg-[#1E293B] h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${isGateOpen ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                style={{ width: `${dwellProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Hyperparameters Card */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Calibration Parameters
          </span>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1E293B]">
              <span className="text-slate-400">Baseline Version:</span>
              <span className="text-cyan-400 font-mono font-bold">v{calibInfo?.version || 1}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1E293B]">
              <span className="text-slate-400">Exponential Rate (&alpha;):</span>
              <span className="text-slate-200 font-mono">{calibInfo?.alpha_calib || 0.05}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Min Dwell Window:</span>
              <span className="text-slate-200 font-mono">{calibInfo?.h_min_dwell_s || 5.0} s</span>
            </div>
          </div>
        </div>

        {/* Protection Proof Card */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Contamination Proof
          </span>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Standard adaptive filters degrade when machines experience prolonged slow faults because the filter
            absorbs the faulty readings into its normal reference. SC-CAMV strictly gates updates:
            Gate = (State == NORMAL) and (Dwell &gt;= H_min).
            This guarantees zero baseline corruption during elevated risk.
          </p>
        </div>
      </div>

      {/* Guided Sensor Calibration Wizards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Wizard 1: ACS712 Current Calibration */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">ACS712 Current Sensor Zero & Sensitivity Wizard</h3>
          </div>
          <p className="text-xs text-slate-400">
            Mandatory Safety Precondition: Motor MUST be stationary and de-energized (0A flowing) when zero-offset is captured.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Zero-Current Voltage Offset (V):</label>
              <input
                type="number"
                step="0.001"
                value={zeroCurrentV}
                onChange={(e) => setZeroCurrentV(Number(e.target.value))}
                className="w-full bg-[#111827] border border-slate-700 rounded p-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-400">Nominal 2.500V - 2.515V at ADC ~514</span>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Sensitivity (V / A):</label>
              <input
                type="number"
                step="0.001"
                value={currentSens}
                onChange={(e) => setCurrentSens(Number(e.target.value))}
                className="w-full bg-[#111827] border border-slate-700 rounded p-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-400">0.066 V/A for 30A module, 0.185 V/A for 5A module</span>
            </div>

            <button
              onClick={handleCalibrateACS}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-xs transition-all"
            >
              Apply ACS712 Calibration
            </button>

            {acsCalibResult && (
              <div className="p-2.5 rounded bg-[#131E35] border border-cyan-800 text-cyan-300 text-[11px]">
                {acsCalibResult}
              </div>
            )}
          </div>
        </div>

        {/* Wizard 2: MPU6050 Orientation & Gravity Wizard */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">MPU6050 Orientation & Gravity Alignment Wizard</h3>
          </div>
          <p className="text-xs text-slate-400">
            Calibrates reference gravity vector Az for stationary baseline. Automatically detects Upright (Az ≈ +1.0g) or Inverted (Az ≈ -1.0g).
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Stationary Gravity Vector Z (g):</label>
              <input
                type="number"
                step="0.05"
                value={gravityZ}
                onChange={(e) => setGravityZ(Number(e.target.value))}
                className="w-full bg-[#111827] border border-slate-700 rounded p-2 text-slate-200 font-mono"
              />
              <span className="text-[10px] text-slate-400">Nominal +1.00g (Upright) or -1.00g (Inverted)</span>
            </div>

            <button
              onClick={handleCalibrateMPU}
              className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs transition-all"
            >
              Apply MPU6050 Orientation Calibration
            </button>

            {mpuCalibResult && (
              <div className="p-2.5 rounded bg-[#1C1811] border border-amber-800 text-amber-300 text-[11px]">
                {mpuCalibResult}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sensor Baseline Statistics Table */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Active Learned Baseline Parameter Estimates
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-slate-400 uppercase bg-[#070D18]">
                <th className="p-3">Sensor Dimension</th>
                <th className="p-3 text-center">Mean (&mu;)</th>
                <th className="p-3 text-center">Std Dev (&sigma;)</th>
                <th className="p-3 text-center">Tolerance Range (&plusmn;2&sigma;)</th>
                <th className="p-3 text-center">Min Observed</th>
                <th className="p-3 text-center">Max Observed</th>
                <th className="p-3 text-center">Sample Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-slate-300">
              {calibInfo?.baseline &&
                Object.entries(calibInfo.baseline).map(([sensorKey, stats]) => {
                  const std = Math.sqrt(Math.max(1e-4, stats.variance));
                  return (
                    <tr key={sensorKey} className="hover:bg-[#131D33]">
                      <td className="p-3 font-semibold text-slate-200 uppercase font-mono">
                        {sensorKey}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-cyan-300">
                        {stats.mean.toFixed(2)}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-300">
                        {std.toFixed(2)}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-400">
                        [{(stats.mean - 2 * std).toFixed(1)}, {(stats.mean + 2 * std).toFixed(1)}]
                      </td>
                      <td className="p-3 text-center font-mono text-slate-500">
                        {stats.min.toFixed(2)}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-500">
                        {stats.max.toFixed(2)}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-400">
                        {stats.count}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
