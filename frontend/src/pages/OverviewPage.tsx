import React, { useState } from 'react';
import {
  Zap,
  Activity,
  Eye,
  CloudRain,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  Play,
  Square,
  AlertOctagon,
  HelpCircle,
  Cpu,
} from 'lucide-react';
import { RawSensorFrame, DecisionExplanation } from '../types';
import {
  startMotor,
  stopMotor,
  setMotorPWM,
  emergencyStop,
} from '../services/api';

interface OverviewPageProps {
  telemetry: RawSensorFrame | null;
  decision: DecisionExplanation | null;
  activePwm: number;
  setActiveTab: (tab: string) => void;
  onRunScenario: (key: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  telemetry,
  decision,
  activePwm,
  setActiveTab,
  onRunScenario,
}) => {
  const t = telemetry;
  const d = decision;
  const [sliderPwm, setSliderPwm] = useState<number>(activePwm || 150);
  const [isMotorActionLoading, setIsMotorActionLoading] = useState<boolean>(false);

  const handleStart = async () => {
    setIsMotorActionLoading(true);
    try {
      await startMotor(sliderPwm > 0 ? sliderPwm : 150);
    } catch (err) {
      console.error(err);
    } finally {
      setIsMotorActionLoading(false);
    }
  };

  const handleStop = async () => {
    setIsMotorActionLoading(true);
    try {
      await stopMotor();
    } catch (err) {
      console.error(err);
    } finally {
      setIsMotorActionLoading(false);
    }
  };

  const handleSliderChange = async (newPwm: number) => {
    setSliderPwm(newPwm);
    try {
      await setMotorPWM(newPwm);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEstop = async () => {
    setIsMotorActionLoading(true);
    try {
      await emergencyStop();
    } catch (err) {
      console.error(err);
    } finally {
      setIsMotorActionLoading(false);
    }
  };

  const isObstacleDetected = t?.ir_object_detected ?? false;
  const isRunning = (t?.motor_pwm ?? 0) > 0;
  const sourceLabel = t?.source || (t?.is_simulated ? 'SIMULATED' : 'REAL');

  return (
    <div className="space-y-6">
      {/* Top Banner: System Title, Provenance, Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-[#1E293B]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              SC-CAMV Motor Health & Diagnostics Overview
            </h1>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
              sourceLabel === 'REAL'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : sourceLabel === 'FALLBACK'
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300'
            }`}>
              SOURCE: {sourceLabel}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Self-Calibrating Multifactor Health and Adaptive Protection Framework. Active sensors: ACS712 (A1), MPU6050 (A4/A5), IR (D2), DHT11 (D4).
          </p>
        </div>

        {/* Quick Access Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('faults')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Fault Lab
          </button>
          <button
            onClick={() => setActiveTab('calibration')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#131E35] hover:bg-[#1E2D4F] border border-[#23345A] text-slate-300 transition-all"
          >
            Calibration Wizard
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-300 transition-all flex items-center gap-1"
          >
            Live Monitor <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Primary Physical Sensor Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sensor 1: ACS712 Motor Current (A1) */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" /> Motor Armature Current
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              ACS712 (A1)
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {t?.current_a !== null && t?.current_a !== undefined ? t.current_a.toFixed(3) : '--'}
            </span>
            <span className="text-sm font-medium text-slate-400">A</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Raw ADC: <strong className="text-slate-300 font-mono">{t?.current_raw_adc ?? (t?.current_v ? Math.round(t.current_v * 1023 / 5) : 514)}</strong></span>
              <span>Voltage: <strong className="text-slate-300 font-mono">{t?.current_v ? `${t.current_v.toFixed(3)}V` : '2.512V'}</strong></span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <span>Baseline: ~0.55 A</span>
              <span className={t && t.current_a && t.current_a > 1.4 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                {t && t.current_a && t.current_a > 1.4 ? 'Overcurrent' : 'Nominal'}
              </span>
            </div>
          </div>
        </div>

        {/* Sensor 2: MPU6050 Motion & Vibration (A4/A5, Mounted Upside Down) */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-400" /> Vibration & Motion
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              MPU6050 (I²C)
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {t?.vibe_g !== null && t?.vibe_g !== undefined ? t.vibe_g.toFixed(3) : '--'}
            </span>
            <span className="text-sm font-medium text-slate-400">g RMS</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span>Ax: {t?.ax !== null && t?.ax !== undefined ? t.ax.toFixed(2) : '0.00'}</span>
              <span>Ay: {t?.ay !== null && t?.ay !== undefined ? t.ay.toFixed(2) : '0.00'}</span>
              <span>Az: <strong className="text-amber-300">{t?.az !== null && t?.az !== undefined ? t.az.toFixed(2) : '-1.00'}</strong></span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <span className="text-[10px] text-slate-400">
                Orientation: <span className="font-semibold text-slate-200">
                  {t?.az !== null && t?.az !== undefined
                    ? (t.az > 0.5 ? 'Normal (Upright)' : t.az < -0.5 ? 'Upside Down' : 'Tilted')
                    : 'Normal (Upright)'}
                </span>
              </span>
              <span className={t && t.vibe_g && t.vibe_g > 0.4 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                {t && t.vibe_g && t.vibe_g > 0.4 ? 'High Vibration' : 'Smooth'}
              </span>
            </div>
          </div>
        </div>

        {/* Sensor 3: IR Stationary Obstacle Sensor (D2) */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-purple-400" /> Obstacle Detection
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              IR Sensor (D2)
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`text-xl font-bold ${
              isObstacleDetected ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {isObstacleDetected ? 'OBSTACLE DETECTED' : 'CLEAR'}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Raw Pin State: <strong className="text-slate-300 font-mono">{t?.ir_raw_state ?? (isObstacleDetected ? 0 : 1)} (Active LOW)</strong></span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <span className="text-[10px] text-slate-400">Stationary Guard Mode</span>
              <span className={isObstacleDetected ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                {isObstacleDetected ? 'Proximity Alert' : 'Path Secure'}
              </span>
            </div>
          </div>
        </div>

        {/* Sensor 4: DHT11 Environmental Sensor (D4) */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <CloudRain className="w-4 h-4 text-blue-400" /> Ambient Room Context
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              DHT11 (D4)
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <div>
              <span className="text-2xl font-bold font-mono text-slate-100">
                {t?.amb_temp_c !== null && t?.amb_temp_c !== undefined ? t.amb_temp_c.toFixed(1) : '--'}
              </span>
              <span className="text-sm font-medium text-slate-400"> °C</span>
            </div>
            <div className="text-slate-400">/</div>
            <div>
              <span className="text-2xl font-bold font-mono text-slate-100">
                {t?.amb_hum_pct !== null && t?.amb_hum_pct !== undefined ? Math.round(t.amb_hum_pct) : '--'}
              </span>
              <span className="text-sm font-medium text-slate-400"> %RH</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-cyan-400 font-medium">Room Context Only</span>
              <span className="text-emerald-400">Valid</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-tight pt-1 border-t border-slate-800">
              Ambient reference context; not motor winding temp. (LM35 decommissioned).
            </p>
          </div>
        </div>
      </div>

      {/* Motor Control & Actuation Command Panel */}
      <div className="p-5 rounded-xl bg-[#0F172A] border border-[#1E293B]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100">Motor Actuation & Safe Control Station</h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              Commanded: <strong className="text-cyan-300 font-mono">{t?.commanded_motor_state || (isRunning ? 'RUNNING' : 'STOPPED')}</strong>
            </span>
            <span className="text-slate-400">
              Physical Inferred: <strong className="text-amber-300 font-mono">{t?.inferred_motor_state || (isRunning ? 'RUNNING' : 'STOPPED')}</strong>
            </span>
          </div>
        </div>

        {/* Warning Note on PWM vs Physical Speed */}
        <div className="p-3 rounded-lg bg-[#0A0F1D] border border-slate-800 mb-4 flex items-start gap-2.5 text-xs text-slate-400">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-200">Engineering Principle:</strong> PWM is an electrical duty-cycle command (0-255), not physical RPM. Physical movement is corroborated independently via current draw and accelerometer vibration RMS.
          </div>
        </div>

        {/* Controls Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* PWM Slider */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-300">Commanded PWM (0 - 255):</span>
              <span className="font-mono text-cyan-400 font-bold bg-[#131E35] px-2 py-0.5 rounded border border-cyan-800/40">
                {sliderPwm} / 255 ({(sliderPwm / 255 * 100).toFixed(0)}%)
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="255"
              step="5"
              value={sliderPwm}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="w-full h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0 (Off)</span>
              <span className="text-cyan-400 font-semibold">150 (Firmware Default & Reliable Start)</span>
              <span>255 (100% Duty)</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              onClick={handleStart}
              disabled={isMotorActionLoading}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Start Motor
            </button>
            <button
              onClick={handleStop}
              disabled={isMotorActionLoading}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-100 transition-all flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
            <button
              onClick={handleEstop}
              disabled={isMotorActionLoading}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40 transition-all flex items-center gap-1.5"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> ESTOP
            </button>
          </div>
        </div>
      </div>

      {/* Decision Engine & Evidence Panel */}
      <div className="p-5 rounded-xl bg-[#0F172A] border border-[#1E293B] space-y-4">
        <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100">SC-CAMV Explainable Health Engine</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Risk Score:</span>
            <span className="text-sm font-mono font-bold text-cyan-400">
              {d?.risk_score !== undefined ? d.risk_score.toFixed(1) : '0.0'} / 100
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Supporting Evidence */}
          <div className="p-3 rounded-lg bg-[#111827] border border-[#1E293B]">
            <h4 className="font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Corroborating Signals ({d?.supporting_evidence?.length || 0})
            </h4>
            {d?.supporting_evidence && d.supporting_evidence.length > 0 ? (
              <ul className="space-y-1 text-slate-300 text-[11px]">
                {d.supporting_evidence.map((ev, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{ev.sensor_name}:</span>
                    <span className="text-emerald-400 font-mono">Z = {ev.deviation_z.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 text-[11px]">No anomalous supporting signals detected.</p>
            )}
          </div>

          {/* Contradictory Evidence */}
          <div className="p-3 rounded-lg bg-[#111827] border border-[#1E293B]">
            <h4 className="font-semibold text-purple-400 mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Contradiction Rejections ({d?.contradictory_evidence?.length || 0})
            </h4>
            {d?.contradictory_evidence && d.contradictory_evidence.length > 0 ? (
              <ul className="space-y-1 text-slate-300 text-[11px]">
                {d.contradictory_evidence.map((ev, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{ev.sensor_name}:</span>
                    <span className="text-purple-400">{ev.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 text-[11px]">No active contradiction rejections.</p>
            )}
          </div>

          {/* Protective Action */}
          <div className="p-3 rounded-lg bg-[#111827] border border-[#1E293B]">
            <h4 className="font-semibold text-cyan-400 mb-2 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Protective Directive
            </h4>
            <div className="text-sm font-bold font-mono text-slate-100">
              {d?.action_requested || 'NONE (OBSERVE)'}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {d?.rules_triggered && d.rules_triggered.length > 0
                ? `Triggered: ${d.rules_triggered.join(', ')}`
                : 'All parameters within adaptive tolerance.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
