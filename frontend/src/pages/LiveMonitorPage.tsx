import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Play, Pause, Trash2, Download, Radio, Zap, Activity, CloudRain, Sliders } from 'lucide-react';
import { RawSensorFrame, DecisionExplanation } from '../types';

interface LiveMonitorPageProps {
  history: Array<{ telemetry: RawSensorFrame; decision: DecisionExplanation }>;
  isStreaming: boolean;
  setIsStreaming: (s: boolean) => void;
  onClearHistory: () => void;
}

export const LiveMonitorPage: React.FC<LiveMonitorPageProps> = ({
  history,
  isStreaming,
  setIsStreaming,
  onClearHistory,
}) => {
  const [windowSize, setWindowSize] = useState<number>(40);

  // Format chart data points from active SC-CAMV telemetry
  const chartData = history.slice(-windowSize).map((item, idx) => ({
    index: idx,
    time: new Date(item.telemetry.timestamp_ms).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
    current: item.telemetry.current_a,
    vibe: item.telemetry.vibe_g,
    amb_temp: item.telemetry.amb_temp_c,
    amb_hum: item.telemetry.amb_hum_pct,
    pwm: item.telemetry.motor_pwm,
    risk: item.decision.risk_score,
  }));

  const handleDownloadCsv = () => {
    window.open('/api/v1/export/telemetry.csv', '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1E293B]">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            Live Telemetry & Scrolling Waveforms
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time physical telemetry stream from ACS712, MPU6050, and DHT11 with adaptive baseline bounds.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5">
          {/* Pause / Resume */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isStreaming
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
                : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
            }`}
          >
            {isStreaming ? <><Pause className="w-3.5 h-3.5" /> Pause Charts</> : <><Play className="w-3.5 h-3.5" /> Resume Charts</>}
          </button>

          {/* Window size */}
          <div className="flex items-center bg-[#131E35] border border-[#23345A] rounded-lg text-xs p-1">
            {[20, 40, 80].map((sz) => (
              <button
                key={sz}
                onClick={() => setWindowSize(sz)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  windowSize === sz ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sz} pts
              </button>
            ))}
          </div>

          {/* Clear Buffer */}
          <button
            onClick={onClearHistory}
            className="p-2 rounded-lg bg-[#131E35] border border-[#23345A] text-slate-400 hover:text-rose-400 transition-all"
            title="Clear buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Download CSV */}
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/80 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Empty State Banner */}
      {chartData.length === 0 && (
        <div className="p-6 rounded-xl bg-[#0F172A] border border-[#1E293B] text-center space-y-2">
          <Radio className="w-8 h-8 text-cyan-400 mx-auto animate-pulse" />
          <h3 className="text-sm font-bold text-slate-200">Awaiting Telemetry Stream</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Live waveforms will populate automatically as valid frames arrive at 5 Hz. Connect your Arduino via USB in System Diagnostics or switch to Simulation mode.
          </p>
        </div>
      )}

      {/* 2x2 Grid of Scrolling Waveform Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. ACS712 Current Chart */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B]">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" /> Motor Armature Current (Amperes - ACS712 A1)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Baseline: ~0.55A | Stall: &gt; 1.60A
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time" stroke="#475569" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 'auto']} stroke="#475569" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0B1120', borderColor: '#23345A', fontSize: '11px' }} />
                <ReferenceLine y={0.55} stroke="#06B6D4" strokeDasharray="3 3" label={{ value: 'Idle Fan', fill: '#06B6D4', fontSize: 10 }} />
                <ReferenceLine y={1.60} stroke="#F59E0B" strokeDasharray="2 2" label={{ value: 'Overload', fill: '#F59E0B', fontSize: 10 }} />
                <Line type="monotone" dataKey="current" stroke="#06B6D4" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. MPU6050 Vibration Chart */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B]">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-400" /> Vibration RMS Acceleration (g - MPU6050)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Baseline: ~0.08g | Warning: &gt; 0.40g
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time" stroke="#475569" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 'auto']} stroke="#475569" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0B1120', borderColor: '#23345A', fontSize: '11px' }} />
                <ReferenceLine y={0.08} stroke="#06B6D4" strokeDasharray="3 3" label={{ value: 'Normal', fill: '#06B6D4', fontSize: 10 }} />
                <ReferenceLine y={0.40} stroke="#F59E0B" strokeDasharray="2 2" label={{ value: 'Warn', fill: '#F59E0B', fontSize: 10 }} />
                <ReferenceLine y={1.10} stroke="#EF4444" strokeDasharray="2 2" label={{ value: 'Trip', fill: '#EF4444', fontSize: 10 }} />
                <Line type="monotone" dataKey="vibe" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. DHT11 Environmental Context Chart */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B]">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <CloudRain className="w-4 h-4 text-blue-400" /> Ambient Room Context (DHT11 D4)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Ambient Reference Context Only
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time" stroke="#475569" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" domain={['auto', 'auto']} stroke="#38BDF8" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#818CF8" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0B1120', borderColor: '#23345A', fontSize: '11px' }} />
                <Line yAxisId="left" type="monotone" dataKey="amb_temp" name="Ambient Temp (°C)" stroke="#38BDF8" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="amb_hum" name="Humidity (%)" stroke="#818CF8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Commanded PWM & System Health Risk Score */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B]">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-purple-400" /> Commanded PWM & Risk Score (0-100)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Protection State Machine
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time" stroke="#475569" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="pwm" domain={[0, 255]} stroke="#A855F7" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="risk" orientation="right" domain={[0, 100]} stroke="#F43F5E" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0B1120', borderColor: '#23345A', fontSize: '11px' }} />
                <ReferenceLine yAxisId="risk" y={60} stroke="#F59E0B" strokeDasharray="2 2" label={{ value: 'Warn', fill: '#F59E0B', fontSize: 10 }} />
                <ReferenceLine yAxisId="risk" y={85} stroke="#EF4444" strokeDasharray="2 2" label={{ value: 'Derate', fill: '#EF4444', fontSize: 10 }} />
                <Line yAxisId="pwm" type="monotone" dataKey="pwm" name="PWM Duty (0-255)" stroke="#A855F7" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="risk" type="monotone" dataKey="risk" name="Risk Score (0-100)" stroke="#F43F5E" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
