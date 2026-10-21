import React, { useEffect, useState } from 'react';
import {
  History,
  Download,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  RotateCcw,
  Clock,
  Layers,
} from 'lucide-react';
import { fetchTelemetryHistory } from '../services/api';
import { STATE_STYLES } from '../components/layout/Topbar';

interface DecisionRecord {
  id?: number;
  timestamp_iso: string;
  state: string;
  risk_score: number;
  confidence: number;
  action_requested: string;
  action_executed: number | boolean;
  rules?: string[];
  rules_json?: string;
  supporting?: any[];
  contradictory?: any[];
}

export const HistoryEventsPage: React.FC = () => {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [filterState, setFilterState] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const loadHistory = async () => {
    try {
      const data = await fetchTelemetryHistory(150);
      setDecisions(data.decisions || []);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredDecisions = decisions.filter((d) => {
    if (filterState !== 'ALL' && d.state !== filterState) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const rules = Array.isArray(d.rules) ? d.rules.join(' ') : d.rules_json || '';
      return (
        d.timestamp_iso.toLowerCase().includes(q) ||
        d.state.toLowerCase().includes(q) ||
        d.action_requested.toLowerCase().includes(q) ||
        rules.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <History className="w-4 h-4" />
            Audit Trail & Event Log
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            Persistent System State & Protective Action Audit Log
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Complete sequential log of algorithm transitions, triggered rules, corroborating/contradicting
            sensor metrics, and executed protective actions recorded in SQLite.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href="/api/v1/export/decisions.csv"
            download
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-4 h-4" /> Export Decisions CSV
          </a>
          <button
            onClick={loadHistory}
            className="p-2 rounded-lg bg-[#070D18] hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all"
            title="Refresh history log"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by state, rule, action, or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#070D18] border border-[#1E293B] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* State Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs">
          <span className="text-slate-500 text-[10px] uppercase font-bold mr-1">Filter:</span>
          {['ALL', 'NORMAL', 'WATCH', 'WARNING', 'HIGH_RISK', 'CRITICAL', 'HARD_LOCKOUT'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterState(st)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                filterState === st
                  ? 'bg-cyan-600 text-white'
                  : 'bg-[#070D18] text-slate-400 hover:text-slate-200 border border-[#1E293B]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200">
            Logged Events ({filteredDecisions.length})
          </h2>
          <span className="text-xs font-mono text-slate-400">Total Recorded: {decisions.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-[11px] font-semibold text-slate-400 uppercase bg-[#070D18]">
                <th className="p-3">Timestamp (UTC)</th>
                <th className="p-3">State</th>
                <th className="p-3 text-center">Risk Score</th>
                <th className="p-3 text-center">Confidence</th>
                <th className="p-3">Protective Action</th>
                <th className="p-3">Rules Fired / Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-slate-300">
              {filteredDecisions.length > 0 ? (
                filteredDecisions.map((d, idx) => {
                  const stateStyle = (STATE_STYLES as any)[d.state] || STATE_STYLES.NORMAL;
                  const rulesText = Array.isArray(d.rules) ? d.rules.join(', ') : d.rules_json || 'Nominal baseline';
                  return (
                    <tr key={idx} className="hover:bg-[#131D33]">
                      <td className="p-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                        {d.timestamp_iso ? d.timestamp_iso.replace('T', ' ').slice(0, 19) : '--'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${stateStyle.bg} ${stateStyle.text} ${stateStyle.border}`}
                        >
                          {d.state}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-200">
                        {d.risk_score.toFixed(1)}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-400">
                        {(d.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="p-3 font-mono text-cyan-400 text-[11px] whitespace-nowrap">
                        {d.action_requested}
                      </td>
                      <td className="p-3 text-slate-400 text-[11px] max-w-md truncate">
                        {rulesText}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No matching events recorded. Run a simulation scenario or connect hardware to record data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
