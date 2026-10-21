import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { RawSensorFrame, DecisionExplanation, CalibrationInfo } from './types';
import { wsClient } from './services/websocket';
import {
  fetchLatestTelemetry,
  selectAlgorithm,
  resetLockout,
  setEngineMode,
  fetchCalibrationCurrent,
  runScenario,
  emergencyStop,
} from './services/api';

// Pages
import { OverviewPage } from './pages/OverviewPage';
import { LiveMonitorPage } from './pages/LiveMonitorPage';
import { AlgorithmExplorerPage } from './pages/AlgorithmExplorerPage';
import { ScenarioLabPage } from './pages/ScenarioLabPage';
import { FaultInjectionLabPage } from './pages/FaultInjectionLabPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { EvaluationReportsPage } from './pages/EvaluationReportsPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { DeviceSensorsPage } from './pages/DeviceSensorsPage';
import { HistoryEventsPage } from './pages/HistoryEventsPage';
import { SystemDiagnosticsPage } from './pages/SystemDiagnosticsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [mode, setMode] = useState<string>('SIMULATION');
  const [activeAlgorithm, setActiveAlgorithm] = useState<string>('SC-CAMV');
  const [telemetry, setTelemetry] = useState<RawSensorFrame | null>(null);
  const [decision, setDecision] = useState<DecisionExplanation | null>(null);
  const [calibrationInfo, setCalibrationInfo] = useState<CalibrationInfo | null>(null);
  const [activePwm, setActivePwm] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [serialPort, setSerialPort] = useState<string | null>(null);
  const [serialStatus, setSerialStatus] = useState<string>('DISCONNECTED');
  const [isLive, setIsLive] = useState<boolean>(false);

  // Live streaming history for charts
  const [history, setHistory] = useState<Array<{ telemetry: RawSensorFrame; decision: DecisionExplanation }>>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Initial Fetch & Calibration Loader
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [telData, calData] = await Promise.all([
          fetchLatestTelemetry(),
          fetchCalibrationCurrent(),
        ]);
        if (telData.telemetry) setTelemetry(telData.telemetry);
        if (telData.decision) setDecision(telData.decision);
        if (telData.active_pwm !== undefined) setActivePwm(telData.active_pwm);
        if (telData.mode) setMode(telData.mode);
        setCalibrationInfo(calData);
      } catch (err) {
        console.warn('Initial telemetry fetch failed', err);
      }
    };

    fetchInitial();

    // Connect WebSocket
    wsClient.connect();

    const unsubConn = wsClient.on('connection', (c) => {
      setWsConnected(c.status === 'CONNECTED');
    });

    const unsubLive = wsClient.on('live_update', (data) => {
      if (data.telemetry) setTelemetry(data.telemetry);
      if (data.decision) setDecision(data.decision);
      if (data.engine?.active_pwm !== undefined) setActivePwm(data.engine.active_pwm);
      if (data.engine?.mode) setMode(data.engine.mode);
      if (data.engine?.algorithm) setActiveAlgorithm(data.engine.algorithm);
      if (data.engine?.serial_port !== undefined) setSerialPort(data.engine.serial_port);
      if (data.engine?.serial_status !== undefined) setSerialStatus(data.engine.serial_status);
      if (data.engine?.is_live !== undefined) setIsLive(data.engine.is_live);

      // Append to live chart history
      if (data.telemetry && data.decision && isStreaming) {
        setHistory((prev) => {
          const next = [...prev, { telemetry: data.telemetry, decision: data.decision }];
          return next.length > 150 ? next.slice(-150) : next;
        });
      }
    });

    const unsubTrans = wsClient.on('state_transition', (data) => {
      showToast(`State Transition: ${data.from_state} ➔ ${data.to_state} (${data.action})`);
    });

    return () => {
      unsubConn();
      unsubLive();
      unsubTrans();
    };
  }, [isStreaming]);

  const handleSelectAlgorithm = async (name: string) => {
    try {
      await selectAlgorithm(name);
      setActiveAlgorithm(name);
      showToast(`Active algorithm switched to ${name}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmergencyStop = async () => {
    try {
      await emergencyStop();
      showToast('EMERGENCY STOP TRIGGERED — Motor de-energized (PWM 0)');
    } catch (err: any) {
      showToast(`Emergency stop error: ${err.message}`);
    }
  };

  const handleResetLockout = async () => {
    try {
      await resetLockout();
      showToast('Lockout reset cleared by operator.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetMode = async (newMode: string) => {
    try {
      await setEngineMode(newMode);
      setMode(newMode);
      showToast(`Engine mode switched to ${newMode}`);
    } catch (err: any) {
      showToast(`Mode switch error: ${err.message}`);
    }
  };

  const handleRunScenario = async (key: string) => {
    try {
      await runScenario(key);
      showToast(`Running scenario: ${key}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-[#070D18] text-slate-100 font-sans antialiased overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg bg-cyan-950/90 border border-cyan-500/50 text-cyan-200 text-xs font-semibold shadow-xl backdrop-blur animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Industrial Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mode={mode}
        setMode={handleSetMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Command Bar */}
        <Topbar
          mode={mode}
          activeAlgorithm={activeAlgorithm}
          onSelectAlgorithm={handleSelectAlgorithm}
          decision={decision}
          activePwm={activePwm}
          onEmergencyStop={handleEmergencyStop}
          onResetLockout={handleResetLockout}
          serialPort={serialPort}
          serialStatus={serialStatus}
          isLive={isLive}
        />

        {/* Dynamic Page Container */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#070D18]">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'overview' && (
              <OverviewPage
                telemetry={telemetry}
                decision={decision}
                activePwm={activePwm}
                setActiveTab={setActiveTab}
                onRunScenario={handleRunScenario}
              />
            )}
            {activeTab === 'monitor' && (
              <LiveMonitorPage
                history={history}
                isStreaming={isStreaming}
                setIsStreaming={setIsStreaming}
                onClearHistory={() => setHistory([])}
              />
            )}
            {activeTab === 'explorer' && (
              <AlgorithmExplorerPage
                telemetry={telemetry}
                decision={decision}
                calibrationInfo={calibrationInfo}
              />
            )}
            {activeTab === 'scenarios' && (
              <ScenarioLabPage
                telemetry={telemetry}
                decision={decision}
              />
            )}
            {activeTab === 'faults' && (
              <FaultInjectionLabPage
                telemetry={telemetry}
                decision={decision}
              />
            )}
            {activeTab === 'experiments' && (
              <ExperimentsPage
                telemetry={telemetry}
                decision={decision}
              />
            )}
            {activeTab === 'evaluation' && (
              <EvaluationReportsPage />
            )}
            {activeTab === 'calibration' && (
              <CalibrationPage />
            )}
            {activeTab === 'devices' && (
              <DeviceSensorsPage />
            )}
            {activeTab === 'history' && (
              <HistoryEventsPage />
            )}
            {activeTab === 'diagnostics' && (
              <SystemDiagnosticsPage />
            )}
            {activeTab === 'settings' && (
              <SettingsPage />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
