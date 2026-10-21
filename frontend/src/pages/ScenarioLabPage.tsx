import React, { useEffect, useState } from 'react';
import {
  FlaskConical,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sliders,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { RawSensorFrame, DecisionExplanation, ScenarioDefinition } from '../types';
import {
  fetchScenarios,
  runScenario,
  pauseScenario,
  resetScenario,
  setScenarioSpeed,
} from '../services/api';
import { STATE_STYLES } from '../components/layout/Topbar';

interface ScenarioLabPageProps {
  telemetry: RawSensorFrame | null;
  decision: DecisionExplanation | null;
}

export const ScenarioLabPage: React.FC<ScenarioLabPageProps> = ({ telemetry, decision }) => {
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [activeKey, setActiveKey] = useState<string>('healthy_baseline');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [step, setStep] = useState<number>(0);
  const [totalSteps, setTotalSteps] = useState<number>(60);
  const [speed, setSpeed] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);

  const loadScenarios = async () => {
    try {
      const data = await fetchScenarios();
      setScenarios(data.scenarios || []);
      setActiveKey(data.active_scenario || 'healthy_baseline');
      setIsRunning(data.is_running || false);
      setStep(data.step || 0);
      setTotalSteps(data.total_steps || 60);
      setSpeed(data.simulation_speed || 1.0);
    } catch (err) {
      console.error('Failed to load scenarios', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScenarios();
    const interval = setInterval(loadScenarios, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleSelectScenario = async (key: string) => {
    setActiveKey(key);
    try {
      await runScenario(key);
      await loadScenarios();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePause = async () => {
    try {
      await pauseScenario();
      setIsRunning(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResume = async () => {
    try {
      await runScenario(activeKey);
      setIsRunning(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = async () => {
    try {
      await resetScenario();
      await loadScenarios();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    setSpeed(newSpeed);
    try {
      await setScenarioSpeed(newSpeed);
    } catch (err) {
      console.error(err);
    }
  };

  const currentScenario = scenarios.find((s) => s.key === activeKey);
  const currentState = decision?.state || 'NORMAL';
  const stateStyle = STATE_STYLES[currentState] || STATE_STYLES.NORMAL;
  const progressPct = totalSteps > 0 ? Math.min(100, Math.round((step / totalSteps) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <FlaskConical className="w-4 h-4" />
            Hardware-in-the-Loop Simulation Lab
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            Deterministic Fault & Contradiction Testbench
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Evaluate the SC-CAMV algorithm against 11 first-principles physical scenarios. Tests include
            ambient heatwave contradiction rejection, mechanical stall, eccentric vibration, and sensor dropouts.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5">
          {isRunning ? (
            <button
              onClick={handlePause}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-sm"
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
          ) : (
            <button
              onClick={handleResume}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
            >
              <Play className="w-4 h-4" /> Run
            </button>
          )}

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
            title="Reset step counter to 0"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>

          {/* Speed Presets */}
          <div className="flex items-center bg-[#070D18] border border-[#1E293B] rounded-lg p-1 text-xs">
            <span className="text-slate-500 px-2 text-[10px] uppercase font-bold">Speed:</span>
            {[0.5, 1.0, 2.0, 5.0].map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                  speed === s
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress & Live Verification Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Active Scenario Progress */}
        <div className="lg:col-span-2 bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-sm font-bold text-slate-200">
                Active Scenario: <span className="text-cyan-300">{currentScenario?.title || activeKey}</span>
              </h2>
            </div>
            <div className="text-xs font-mono text-slate-400">
              Step <span className="text-slate-200 font-bold">{step}</span> / {totalSteps} ({progressPct}%)
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {currentScenario?.description}
          </p>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Live Sensor Matrix in this Scenario */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Motor Current</div>
              <div className="text-base font-bold font-mono text-slate-100 mt-0.5">
                {telemetry?.current_a !== null && telemetry?.current_a !== undefined ? `${telemetry.current_a.toFixed(2)} A` : '--'}
              </div>
            </div>
            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Vibration RMS</div>
              <div className="text-base font-bold font-mono text-slate-100 mt-0.5">
                {telemetry?.vibe_g !== null && telemetry?.vibe_g !== undefined ? `${telemetry.vibe_g.toFixed(3)} g` : '--'}
              </div>
            </div>
            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">IR Obstacle</div>
              <div className={`text-base font-bold mt-0.5 ${telemetry?.ir_object_detected ? 'text-rose-400' : 'text-emerald-400'}`}>
                {telemetry?.ir_object_detected ? 'DETECTED' : 'CLEAR'}
              </div>
            </div>
            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Ambient Temp</div>
              <div className="text-base font-bold font-mono text-slate-100 mt-0.5">
                {telemetry?.amb_temp_c !== null && telemetry?.amb_temp_c !== undefined ? `${telemetry.amb_temp_c.toFixed(1)} °C` : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Algorithm Evaluation Outcome */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Real-Time Decision Output
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-slate-500">Evaluated Health State</div>
              <div className={`mt-1 px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-between ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border}`}>
                <span>{stateStyle.label}</span>
                <span className="text-[10px] font-mono font-normal">Score: {decision?.risk_score.toFixed(1)}/100</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500">Adaptive Response Triggered</div>
              <div className="mt-1 bg-[#070D18] border border-[#1E293B] rounded-lg p-2.5 text-xs text-slate-300 font-mono">
                {decision?.action_requested || 'NONE'}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500">Contradiction / Corroboration Count</div>
              <div className="mt-1 flex gap-2">
                <div className="flex-1 bg-emerald-950/40 border border-emerald-500/30 rounded p-2 text-center">
                  <div className="text-xs font-bold text-emerald-400">{decision?.supporting_evidence.length || 0}</div>
                  <div className="text-[9px] text-slate-400 uppercase">Supporting</div>
                </div>
                <div className="flex-1 bg-blue-950/40 border border-blue-500/30 rounded p-2 text-center">
                  <div className="text-xs font-bold text-blue-400">{decision?.contradictory_evidence.length || 0}</div>
                  <div className="text-[9px] text-slate-400 uppercase">Contradiction</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 11 Scenario Selectors */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          Selectable Physics Scenarios ({scenarios.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {scenarios.map((scen) => {
            const isSelected = scen.key === activeKey;
            const isContradiction = scen.key.includes('contradiction') || scen.key.includes('pressure');
            const isDropout = scen.key.includes('dropout') || scen.key.includes('noise');
            const isSevere = scen.key.includes('overload') || scen.key.includes('catastrophic');

            return (
              <div
                key={scen.key}
                onClick={() => handleSelectScenario(scen.key)}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500 shadow-md ring-1 ring-cyan-500/50'
                    : 'bg-[#0F172A] border-[#1E293B] hover:border-slate-600 hover:bg-[#131E35]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                    {scen.title}
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                      isContradiction
                        ? 'bg-blue-950 text-blue-300 border-blue-700/50'
                        : isSevere
                        ? 'bg-rose-950 text-rose-300 border-rose-700/50'
                        : isDropout
                        ? 'bg-purple-950 text-purple-300 border-purple-700/50'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                    }`}
                  >
                    {isContradiction ? 'Contradiction' : isSevere ? 'Fault' : isDropout ? 'Sensor Issue' : 'Benign'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">
                  {scen.description}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800">
                  <span>Duration: {scen.duration_steps} steps</span>
                  <span className="flex items-center gap-1 text-cyan-400 font-medium">
                    {isSelected ? 'Active' : 'Click to Run'} <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
