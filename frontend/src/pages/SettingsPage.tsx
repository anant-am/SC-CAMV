import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  Database,
  RotateCcw,
  CheckCircle2,
  Save,
  HelpCircle,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [beta, setBeta] = useState<number>(0.85);
  const [gamma, setGamma] = useState<number>(2.0);
  const [alpha, setAlpha] = useState<number>(0.05);
  const [hMin, setHMin] = useState<number>(15.0);
  const [pMax, setPMax] = useState<number>(5.0);
  const [watchThreshold, setWatchThreshold] = useState<number>(30.0);
  const [warnThreshold, setWarnThreshold] = useState<number>(50.0);
  const [highThreshold, setHighThreshold] = useState<number>(70.0);
  const [critThreshold, setCritThreshold] = useState<number>(85.0);

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = () => {
    setSavedMessage('Algorithm parameters saved to active engine configuration.');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  const handleResetDefaults = () => {
    setBeta(0.85);
    setGamma(2.0);
    setAlpha(0.05);
    setHMin(15.0);
    setPMax(5.0);
    setWatchThreshold(30.0);
    setWarnThreshold(50.0);
    setHighThreshold(70.0);
    setCritThreshold(85.0);
    setSavedMessage('Restored nominal academic defaults.');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Settings className="w-4 h-4" />
            Engine Hyperparameters & Configuration
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            SC-CAMV Algorithmic Tuning & System Properties
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Configure the leaky persistence decay (&beta;), anomaly z-threshold (&gamma;),
            temporal dwell gate (H_min), and asymmetric hysteresis state boundaries.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Persistence & Statistical Calibration */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Persistence Accumulator & Gated Calibration
          </h2>

          <div className="space-y-4 text-xs">
            {/* Beta */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-300">
                  Leaky Decay Factor (&beta;): <span className="text-cyan-400 font-mono">{beta}</span>
                </span>
                <span className="text-slate-500 text-[10px]">Range: 0.5 - 0.99</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                value={beta}
                onChange={(e) => setBeta(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Determines how rapidly historical evidence decays: P_i(t) = min(P_max, &beta; P_prev + |z| &Delta;t).
              </p>
            </div>

            {/* Gamma */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-300">
                  Anomaly Z-Threshold (&gamma;): <span className="text-cyan-400 font-mono">{gamma}</span>
                </span>
                <span className="text-slate-500 text-[10px]">Range: 1.0 - 4.0</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                value={gamma}
                onChange={(e) => setGamma(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Number of baseline standard deviations required to flag an active anomaly signal.
              </p>
            </div>

            {/* H_min */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-300">
                  Minimum Normal Dwell (H_min): <span className="text-cyan-400 font-mono">{hMin} s</span>
                </span>
                <span className="text-slate-500 text-[10px]">Range: 5.0 - 60.0 s</span>
              </div>
              <input
                type="range"
                min="5.0"
                max="60.0"
                step="1.0"
                value={hMin}
                onChange={(e) => setHMin(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Time required in undisturbed NORMAL state before the self-calibration gate unlocks.
              </p>
            </div>

            {/* Alpha */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-300">
                  Welford Learning Rate (&alpha;): <span className="text-cyan-400 font-mono">{alpha}</span>
                </span>
                <span className="text-slate-500 text-[10px]">Range: 0.01 - 0.20</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.20"
                step="0.01"
                value={alpha}
                onChange={(e) => setAlpha(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Exponential smoothing coefficient for online baseline mean and variance updates.
              </p>
            </div>
          </div>
        </div>

        {/* Asymmetric State Boundaries */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Asymmetric Hysteresis State Risk Thresholds
          </h2>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-blue-400">WATCH State Escalation:</span>
                <span className="font-mono text-slate-200 font-bold">{watchThreshold} / 100</span>
              </div>
              <input
                type="range"
                min="15.0"
                max="45.0"
                step="1.0"
                value={watchThreshold}
                onChange={(e) => setWatchThreshold(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Early attention boundary; triggers increased logging.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-amber-400">WARNING State Escalation:</span>
                <span className="font-mono text-slate-200 font-bold">{warnThreshold} / 100</span>
              </div>
              <input
                type="range"
                min="35.0"
                max="65.0"
                step="1.0"
                value={warnThreshold}
                onChange={(e) => setWarnThreshold(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Triggers motor PWM derate to 60%.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-orange-400">HIGH_RISK State Escalation:</span>
                <span className="font-mono text-slate-200 font-bold">{highThreshold} / 100</span>
              </div>
              <input
                type="range"
                min="55.0"
                max="80.0"
                step="1.0"
                value={highThreshold}
                onChange={(e) => setHighThreshold(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Triggers aggressive motor PWM derate to 30%.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-rose-400">CRITICAL Shutdown Threshold:</span>
                <span className="font-mono text-slate-200 font-bold">{critThreshold} / 100</span>
              </div>
              <input
                type="range"
                min="75.0"
                max="95.0"
                step="1.0"
                value={critThreshold}
                onChange={(e) => setCritThreshold(parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Triggers immediate motor emergency stop and lockout counter.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
