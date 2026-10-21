import React from 'react';
import {
  Workflow,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
  Activity,
  RotateCw,
  Eye,
  CloudRain,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Database,
  Lock,
} from 'lucide-react';
import { RawSensorFrame, DecisionExplanation, SystemState } from '../types';

interface AlgorithmExplorerPageProps {
  telemetry: RawSensorFrame | null;
  decision: DecisionExplanation | null;
  calibrationInfo: any;
}

export const AlgorithmExplorerPage: React.FC<AlgorithmExplorerPageProps> = ({
  telemetry,
  decision,
  calibrationInfo,
}) => {
  const d = decision;
  const t = telemetry;

  const STAGES = [
    {
      num: 1,
      title: 'Gated Self-Calibration',
      tag: 'Stage 1',
      desc: 'Welford online mean and variance updated ONLY in stable NORMAL state with dwell >= H_min (5s). Freezes during suspect states.',
    },
    {
      num: 2,
      title: 'Deviation & Leaky Persistence',
      tag: 'Stage 2',
      desc: 'Per-sensor normalized z-scores pass through a leaky temporal integrator P_i(t) = min(P_max, beta*P_prev + |z|*dt).',
    },
    {
      num: 3,
      title: 'Corroboration & Contradiction',
      tag: 'Stage 3',
      desc: 'Pairwise physical matrix C_jk rewards physically coupled deviations (C>0) and discounts explained-away anomalies (C<0).',
    },
    {
      num: 4,
      title: 'Asymmetric Hysteresis FSM',
      tag: 'Stage 4',
      desc: 'Multi-band state machine (NORMAL -> WATCH -> WARNING -> HIGH_RISK -> CRITICAL). Fast to escalate, slow to de-escalate.',
    },
    {
      num: 5,
      title: 'Adaptive Actuation & Recovery',
      tag: 'Stage 5',
      desc: 'Graduated actuation (continue, derate 60%, derate 30%, shutdown) with 3-strike bounded recovery probation and lockout.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-[#1E293B]">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Workflow className="w-5 h-5 text-cyan-400" />
          GC-PWCE Algorithm Pipeline Explorer
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Step-by-step visual inspection of Gated-Calibration, Persistence-Weighted Corroboration Engine with Asymmetric Hysteresis.
        </p>
      </div>

      {/* 5-Stage Stepper Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {STAGES.map((stg) => (
          <div
            key={stg.num}
            className="p-3 rounded-xl bg-[#111827] border border-[#1E293B] relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-cyan-400 mb-1">
                <span>{stg.tag}</span>
                <span className="w-5 h-5 rounded-full bg-cyan-950 flex items-center justify-center border border-cyan-800 text-[11px]">
                  {stg.num}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-200">{stg.title}</div>
              <p className="text-[11px] text-slate-400 mt-1 leading-tight">{stg.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Deep-Dive Grid for Stages 1 to 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* STAGE 1: Gated Calibration Status */}
        <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" /> Stage 1: Gated Baseline Calibration Gate
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded font-bold border ${
                calibrationInfo?.is_gate_open
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}
            >
              {calibrationInfo?.is_gate_open ? 'Gate OPEN (Adapting)' : 'Gate CLOSED (Frozen)'}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            The calibration gate prevents <span className="text-slate-200 font-semibold">baseline contamination</span>.
            If the system enters WATCH, WARNING, or CRITICAL, the gate immediately closes so developing faults are
            never absorbed into the normal baseline profile.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-[#0F172A] rounded-lg border border-[#1E293B]">
              <span className="text-slate-400">NORMAL State Dwell:</span>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {calibrationInfo?.normal_dwell_s?.toFixed(1) || '0.0'}s / {calibrationInfo?.h_min_dwell_s || '5.0'}s
              </div>
            </div>
            <div className="p-3 bg-[#0F172A] rounded-lg border border-[#1E293B]">
              <span className="text-slate-400">Baseline Version:</span>
              <div className="text-lg font-bold font-mono text-slate-200 mt-1">
                v{calibrationInfo?.version || 1}
              </div>
            </div>
          </div>
        </div>

        {/* STAGE 2: Leaky Temporal Persistence Integrator */}
        <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" /> Stage 2: Leaky Persistence Integrators P_i(t)
            </h3>
            <span className="text-xs font-mono text-slate-400">Threshold: |z| &gt; 2.0</span>
          </div>

          <div className="space-y-2">
            {[
              { name: 'current_a', label: 'ACS712 Current', val: t?.current_a, icon: Zap, color: 'text-cyan-400' },
              { name: 'vibe_g', label: 'MPU6050 Vibration', val: t?.vibe_g, icon: Activity, color: 'text-amber-400' },
              { name: 'ir_obstacle', label: 'IR Obstacle Sensor', val: t?.ir_object_detected ? 1 : 0, icon: Eye, color: 'text-purple-400' },
              { name: 'amb_temp_c', label: 'DHT11 Ambient Context', val: t?.amb_temp_c, icon: CloudRain, color: 'text-blue-400' },
            ].map((sensor) => {
              const item = d?.supporting_evidence.find((e) => e.sensor_name === sensor.name);
              const pVal = item ? item.persistence_p : 0.0;
              const zVal = item ? item.deviation_z : 0.0;
              return (
                <div key={sensor.name} className="p-2.5 rounded-lg bg-[#0F172A] border border-[#1E293B] text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <sensor.icon className={`w-3.5 h-3.5 ${sensor.color}`} />
                      {sensor.label}
                    </span>
                    <span className="font-mono text-slate-400">
                      z = {zVal > 0 ? `+${zVal.toFixed(2)}` : zVal.toFixed(2)}σ | P = {pVal.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, (pVal / 10.0) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* STAGE 3: Pairwise Corroboration / Contradiction Matrix */}
        <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" /> Stage 3: Pairwise Interaction Matrix C_jk
            </h3>
            <span className="text-xs font-mono text-cyan-400">Embedded Feasible (No DS Renorm)</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded bg-[#0F172A] border border-[#1E293B] flex items-center justify-between">
              <div>
                <span className="font-bold text-emerald-400">Current + Vibration (C = +0.85)</span>
                <p className="text-[11px] text-slate-400">Mechanical load / bearing friction mutually reinforces fault.</p>
              </div>
              <span className="font-mono text-emerald-400 font-bold">+ Corroboration</span>
            </div>

            <div className="p-2.5 rounded bg-[#0F172A] border border-[#1E293B] flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-400">Motor Temp vs Ambient Temp (C = -0.95)</span>
                <p className="text-[11px] text-slate-400">Room heatwave explains motor casing rise, discounting fault hypothesis.</p>
              </div>
              <span className="font-mono text-amber-400 font-bold">- Contradiction</span>
            </div>

            <div className="p-2.5 rounded bg-[#0F172A] border border-[#1E293B] flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-400">Atmospheric Pressure (C = 0.00)</span>
                <p className="text-[11px] text-slate-400">Barometric changes rejected as neutral context (zero correlation).</p>
              </div>
              <span className="font-mono text-slate-400">Neutral</span>
            </div>
          </div>
        </div>

        {/* STAGE 4 & 5: Asymmetric Hysteresis State Machine */}
        <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" /> Stage 4 & 5: Asymmetric Hysteresis & Actuation
            </h3>
            <span className="text-xs font-bold text-cyan-400">Fast Up / Slow Down</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#1E293B]">
              <span className="font-semibold text-slate-300">NORMAL:</span>
              <span className="text-slate-400">R &lt; 25 | PWM 100% (255) | Gate Open</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#1E293B]">
              <span className="font-semibold text-blue-400">WATCH:</span>
              <span className="text-slate-400">R &gt;= 25 sustained 0.8s | Event Logged | Gate Closed</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#1E293B]">
              <span className="font-semibold text-amber-400">WARNING:</span>
              <span className="text-slate-400">R &gt;= 48 sustained 1.0s | PWM Derate 60% (153)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#1E293B]">
              <span className="font-semibold text-orange-400">HIGH_RISK:</span>
              <span className="text-slate-400">R &gt;= 70 sustained 0.6s | PWM Derate 30% (76)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#1E293B]">
              <span className="font-semibold text-rose-400">CRITICAL:</span>
              <span className="text-slate-400">R &gt;= 85 sustained 0.4s | Motor Shutdown (PWM 0)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#1E293B]">
              <span className="font-semibold text-purple-400">HARD LOCKOUT:</span>
              <span className="text-slate-400">Triggered if 3 recovery attempts fail. Requires manual reset.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
