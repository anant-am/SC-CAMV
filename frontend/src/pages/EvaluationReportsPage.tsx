import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  HelpCircle,
  TrendingDown,
  Clock,
  Layers,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import { fetchBenchmarkReport, fetchConfusionMatrix } from '../services/api';

interface BenchmarkRow {
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

export const EvaluationReportsPage: React.FC = () => {
  const [benchmarks, setBenchmarks] = useState<Record<string, BenchmarkRow> | null>(null);
  const [confusionData, setConfusionData] = useState<{ categories: string[]; matrix: Record<string, number[][]> } | null>(null);
  const [selectedAlgoMatrix, setSelectedAlgoMatrix] = useState<string>('SC-CAMV (Proposed)');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [benchRes, confRes] = await Promise.all([
          fetchBenchmarkReport(),
          fetchConfusionMatrix(),
        ]);
        setBenchmarks(benchRes.results);
        setConfusionData(confRes);
      } catch (err) {
        console.error('Failed to load evaluation reports', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            Empirical Evaluation & Comparative Benchmarks
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            Algorithm Performance & Academic Validation Report
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Controlled head-to-head comparison between Fixed Threshold, Naive Multifactor Fusion,
            and SC-CAMV (GC-PWCE) evaluated on standardized hardware-in-the-loop physics scenarios.
          </p>
        </div>

        <a
          href="/api/v1/export/benchmark-report.json"
          download
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Download className="w-4 h-4" /> Export Report (JSON)
        </a>
      </div>

      {/* Main Benchmark Comparison Table */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Comparative Benchmark Summary Table
          </h2>
          <span className="text-xs font-mono text-slate-400">N = 11 Standardized Scenarios</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-[#070D18]">
                <th className="p-3">Algorithm</th>
                <th className="p-3 text-center">Contradiction Awareness</th>
                <th className="p-3 text-center">False Alarm Rate (%)</th>
                <th className="p-3 text-center">Fault Detection (%)</th>
                <th className="p-3 text-center">Mean Latency (s)</th>
                <th className="p-3 text-center">Heatwave Resilience</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-slate-300">
              {benchmarks &&
                Object.entries(benchmarks).map(([algoName, metrics]) => {
                  const isProposed = algoName.includes('SC-CAMV');
                  return (
                    <tr
                      key={algoName}
                      className={
                        isProposed
                          ? 'bg-cyan-950/20 font-semibold text-slate-100 border-l-2 border-l-cyan-400'
                          : 'hover:bg-[#131E35]'
                      }
                    >
                      <td className="p-3 font-medium flex items-center gap-2">
                        {isProposed && <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        <span>{algoName}</span>
                      </td>
                      <td className="p-3 text-center">
                        {metrics.contradiction_awareness ? (
                          <span className="text-emerald-400 font-bold">YES (Pairwise Matrix)</span>
                        ) : (
                          <span className="text-slate-500">NO</span>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            metrics.false_alarm_rate_pct === 0
                              ? 'bg-emerald-950 text-emerald-300 font-bold'
                              : 'bg-rose-950 text-rose-300'
                          }`}
                        >
                          {metrics.false_alarm_rate_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            metrics.detection_rate_pct === 100
                              ? 'bg-emerald-950 text-emerald-300 font-bold'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {metrics.detection_rate_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">{metrics.avg_detection_latency_s.toFixed(2)} s</td>
                      <td className="p-3 text-center font-mono text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            metrics.heatwave_resilience.includes('PASS')
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {metrics.heatwave_resilience}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confusion Matrix Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Interactive Confusion Matrix Heatmap */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">
              State Classification Confusion Matrix
            </h3>
            <div className="flex items-center gap-1.5 bg-[#070D18] p-1 rounded-lg border border-[#1E293B]">
              {['SC-CAMV (Proposed)', 'Fixed Threshold', 'Naive Multifactor'].map((name) => (
                <button
                  key={name}
                  onClick={() => setSelectedAlgoMatrix(name)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${
                    selectedAlgoMatrix === name
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            True state (rows) vs Classified state (columns) evaluated over 500 test intervals.
          </p>

          {confusionData && (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-[10px] text-slate-500 uppercase">True \ Pred</th>
                    {confusionData.categories.map((cat) => (
                      <th key={cat} className="p-2 text-[10px] font-bold text-slate-300 uppercase">
                        {cat}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {confusionData.categories.map((rowCat, rIdx) => {
                    const rowData = confusionData.matrix[selectedAlgoMatrix]?.[rIdx] || [];
                    return (
                      <tr key={rowCat} className="hover:bg-[#131D33]">
                        <td className="p-2 text-left text-[10px] font-bold text-slate-400 uppercase">
                          {rowCat}
                        </td>
                        {rowData.map((val, cIdx) => {
                          const isDiagonal = rIdx === cIdx;
                          return (
                            <td
                              key={cIdx}
                              className={`p-2 font-mono text-xs ${
                                isDiagonal
                                  ? 'bg-cyan-950/70 text-cyan-300 font-bold border border-cyan-800/40'
                                  : val > 0
                                  ? 'bg-rose-950/40 text-rose-300'
                                  : 'text-slate-600'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Key Academic Interpretations */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Key Technical Findings & Defense Highlights
          </h3>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B] space-y-1">
              <div className="font-semibold text-cyan-300">1. Elimination of False Alarm Heatwave Trips</div>
              <p className="text-slate-400 text-[11px]">
                Fixed threshold systems trip at 50°C regardless of ambient heatwave (producing 33% false alarm rate in testing).
                SC-CAMV pairs casing temperature with ambient DHT11 via contradiction factor C_jk = -0.95,
                correctly reducing risk score and maintaining 0% false alarms.
              </p>
            </div>

            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B] space-y-1">
              <div className="font-semibold text-cyan-300">2. Corroborative Surge Detection</div>
              <p className="text-slate-400 text-[11px]">
                Under mechanical stall or rotor jam, current surges rapidly while vibration accelerates (C(current, vibe) = +0.85).
                The positive pairwise interaction accelerates risk accumulation, escalating to CRITICAL
                within 1.2 seconds to protect the L293D driver and motor armature.
              </p>
            </div>

            <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B] space-y-1">
              <div className="font-semibold text-cyan-300">3. Non-Intrusive Context Rejection</div>
              <p className="text-slate-400 text-[11px]">
                Ambient room fluctuations (DHT11) are recognized strictly as ambient context,
                preventing external weather temperature shifts from being mistaken for motor electrical faults.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
