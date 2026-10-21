import React from 'react';
import {
  RotateCcw,
  OctagonAlert,
  Zap,
  Gauge,
  Bluetooth,
  Cpu,
} from 'lucide-react';
import { SystemState, DecisionExplanation } from '../../types';

interface TopbarProps {
  mode: string;
  activeAlgorithm: string;
  onSelectAlgorithm: (name: string) => void;
  decision: DecisionExplanation | null;
  activePwm: number;
  onEmergencyStop: () => void;
  onResetLockout: () => void;
  serialPort?: string | null;
  serialStatus?: string;
  isLive?: boolean;
}

export const STATE_STYLES: Record<SystemState, { bg: string; text: string; border: string; label: string }> = {
  NORMAL: { bg: 'bg-emerald-950/70', text: 'text-emerald-400', border: 'border-emerald-500/40', label: 'NORMAL' },
  WATCH: { bg: 'bg-blue-950/70', text: 'text-blue-400', border: 'border-blue-500/40', label: 'WATCH' },
  WARNING: { bg: 'bg-amber-950/70', text: 'text-amber-400', border: 'border-amber-500/40', label: 'WARNING' },
  HIGH_RISK: { bg: 'bg-orange-950/70', text: 'text-orange-400', border: 'border-orange-500/40', label: 'HIGH RISK' },
  CRITICAL: { bg: 'bg-rose-950/70', text: 'text-rose-400', border: 'border-rose-500/50', label: 'CRITICAL SHUTDOWN' },
  SENSOR_DEGRADED: { bg: 'bg-purple-950/70', text: 'text-purple-400', border: 'border-purple-500/40', label: 'SENSOR DEGRADED' },
  CALIBRATING: { bg: 'bg-cyan-950/70', text: 'text-cyan-400', border: 'border-cyan-500/40', label: 'CALIBRATING' },
  RECOVERY_CHECK: { bg: 'bg-indigo-950/70', text: 'text-indigo-400', border: 'border-indigo-500/40', label: 'RECOVERY PROBATION' },
  HARD_LOCKOUT: { bg: 'bg-red-950/90', text: 'text-red-400', border: 'border-red-500/80', label: 'HARD LOCKOUT' },
};

export const Topbar: React.FC<TopbarProps> = ({
  mode,
  activeAlgorithm,
  onSelectAlgorithm,
  decision,
  activePwm,
  onEmergencyStop,
  onResetLockout,
  serialPort,
  serialStatus = 'DISCONNECTED',
  isLive = false,
}) => {
  const currentState = decision?.state || 'NORMAL';
  const stateStyle = STATE_STYLES[currentState] || STATE_STYLES.NORMAL;
  const riskScore = decision?.risk_score ?? 0;
  const pwmPct = Math.round((activePwm / 255) * 100);

  return (
    <header className="h-16 bg-[#0B1120] border-b border-[#1E293B] px-6 flex items-center justify-between select-none">
      {/* Left: Mode & Status Pill */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#131E35] border border-[#23345A] text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isLive
                ? 'bg-emerald-400 animate-pulse'
                : mode === 'LIVE_HARDWARE'
                ? 'bg-amber-400 animate-ping'
                : 'bg-cyan-400'
            }`}
          />
          <span className="font-semibold text-slate-200">
            {mode === 'LIVE_HARDWARE'
              ? isLive
                ? `${serialPort || 'USB'} (LIVE)`
                : `${serialPort || 'USB'} (${serialStatus})`
              : 'Synthetic Physics HIL'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {mode === 'LIVE_HARDWARE' ? '(9600 baud)' : '(5 Hz)'}
          </span>
        </div>

        {/* State Badge */}
        <div className={`px-3 py-1 rounded-md text-xs font-bold tracking-wider border ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border} flex items-center gap-1.5`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {stateStyle.label}
        </div>
      </div>

      {/* Center: Live Gauges */}
      <div className="hidden lg:flex items-center gap-6">
        {/* Risk Score */}
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Anomaly Risk
            </div>
            <div className="text-base font-bold font-mono-num text-slate-100 leading-tight">
              {riskScore.toFixed(1)}
              <span className="text-xs text-slate-400 font-normal"> / 100</span>
            </div>
          </div>
          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div
              className={`h-full transition-all duration-300 ${
                riskScore > 70 ? 'bg-rose-500' : riskScore > 40 ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
            />
          </div>
        </div>

        {/* PWM Duty */}
        <div className="flex items-center gap-2.5 pl-4 border-l border-[#1E293B]">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-end gap-1">
              <Zap className="w-3 h-3 text-cyan-400" /> Motor PWM
            </div>
            <div className="text-base font-bold font-mono-num text-slate-100 leading-tight">
              {pwmPct}%
              <span className="text-xs text-slate-400 font-normal"> ({activePwm}/255)</span>
            </div>
          </div>
          <div className="w-14 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${pwmPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Right: Controls & Algorithm Selector */}
      <div className="flex items-center gap-3">
        {/* Algorithm Dropdown */}
        <div className="flex items-center gap-1.5 bg-[#131E35] border border-[#23345A] px-2.5 py-1 rounded-md text-xs">
          <span className="text-slate-400">Algo:</span>
          <select
            value={activeAlgorithm}
            onChange={(e) => onSelectAlgorithm(e.target.value)}
            className="bg-transparent text-cyan-300 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="SC-CAMV" className="bg-[#0F172A] text-slate-100">SC-CAMV (Proposed GC-PWCE)</option>
            <option value="FIXED_THRESHOLD" className="bg-[#0F172A] text-slate-100">Fixed Threshold</option>
            <option value="NAIVE_MULTIFACTOR" className="bg-[#0F172A] text-slate-100">Naive Multifactor</option>
          </select>
        </div>

        {/* Lockout Reset / Manual Override */}
        {decision?.lockout_active && (
          <button
            onClick={onResetLockout}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-sm animate-pulse"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear Lockout
          </button>
        )}

        {/* Emergency Stop */}
        <button
          onClick={onEmergencyStop}
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white border border-rose-500/50 transition-all shadow-sm"
          title="Immediate local motor driver shutdown"
        >
          <OctagonAlert className="w-3.5 h-3.5" />
          E-Stop
        </button>
      </div>
    </header>
  );
};
