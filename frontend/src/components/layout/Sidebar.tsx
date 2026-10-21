import React from 'react';
import {
  Activity,
  Radio,
  Workflow,
  FlaskConical,
  SlidersHorizontal,
  BarChart3,
  Gauge,
  Cpu,
  History,
  Settings,
  Terminal,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mode: string;
  setMode: (mode: string) => void;
}

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Activity, badge: 'Live' },
  { id: 'monitor', label: 'Live Monitor', icon: Radio },
  { id: 'explorer', label: 'Algorithm Explorer', icon: Workflow, badge: 'GC-PWCE' },
  { id: 'scenarios', label: 'Scenario Lab', icon: FlaskConical, count: 11 },
  { id: 'faults', label: 'Fault Injection Lab', icon: ShieldAlert, badge: '17 Faults' },
  { id: 'experiments', label: 'Experiments', icon: SlidersHorizontal },
  { id: 'evaluation', label: 'Evaluation & Reports', icon: BarChart3 },
  { id: 'calibration', label: 'Calibration', icon: Gauge },
  { id: 'devices', label: 'Device & Sensors', icon: Cpu },
  { id: 'history', label: 'History & Events', icon: History },
  { id: 'diagnostics', label: 'System Diagnostics', icon: Terminal },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, mode, setMode }) => {
  return (
    <aside className="w-64 bg-[#0B1120] border-r border-[#1E293B] flex flex-col h-screen shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#1E293B]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold tracking-wider text-sm text-slate-100 flex items-center gap-1.5">
              SC-CAMV
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800">
                v1.0
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              Adaptive Protection Rig
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="mt-4 bg-[#0F172A] p-1 rounded-md border border-[#1E293B] flex">
          {(['SIMULATION', 'LIVE_HARDWARE'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1 text-[11px] font-semibold rounded transition-all ${
                mode === m
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'SIMULATION' ? 'Simulation' : 'Live COM'}
            </button>
          ))}
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 font-semibold shadow-inner'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#131D33]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-700/50">
                  {item.badge}
                </span>
              )}
              {item.count !== undefined && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-3.5 border-t border-[#1E293B] text-[11px] text-slate-400 bg-[#070D18]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 font-mono">Engine:</span>
          <span className="text-cyan-400 font-semibold">Active (5 Hz)</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-400">Target:</span>
          <span className="text-slate-300">Arduino UNO / DC Rig</span>
        </div>
      </div>
    </aside>
  );
};
