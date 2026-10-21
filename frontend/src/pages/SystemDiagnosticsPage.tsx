import React, { useEffect, useState } from 'react';
import {
  Terminal,
  Cpu,
  Radio,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Layers,
  Power,
  RefreshCw,
  Usb,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { HardwarePort } from '../types';
import {
  fetchHardwarePorts,
  fetchHardwareStatus,
  connectHardware,
  disconnectHardware,
  fetchHealth,
} from '../services/api';

export const SystemDiagnosticsPage: React.FC = () => {
  const [ports, setPorts] = useState<HardwarePort[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [connStatus, setConnStatus] = useState<string>('DISCONNECTED');
  const [serialDetails, setSerialDetails] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const loadStatus = async () => {
    try {
      const [portsData, statusData, healthData] = await Promise.all([
        fetchHardwarePorts(),
        fetchHardwareStatus(),
        fetchHealth(),
      ]);

      const portList: HardwarePort[] = portsData.ports || [];
      setPorts(portList);

      // Preserve existing user selection if valid; do NOT erase on polling
      if (portList.length > 0) {
        const connectedP = portsData.connected_port || statusData.serial?.port;
        const currentSelectedValid = selectedPort && portList.some((p) => p.port === selectedPort);

        if (connectedP && ['LIVE', 'CONNECTED', 'CONNECTING', 'CONNECTED_WAITING_FOR_TELEMETRY', 'STALE'].includes(statusData.serial?.status)) {
          setSelectedPort(connectedP);
        } else if (!currentSelectedValid) {
          // Prioritize physical Arduino / USB port
          const arduinoPort = portList.find((p: any) => p.is_arduino || (p.is_usb && !p.is_bluetooth));
          setSelectedPort(arduinoPort ? arduinoPort.port : portList[0].port);
        }
      }

      setConnStatus(statusData.serial?.status || 'DISCONNECTED');
      setSerialDetails(statusData.serial);
      setSystemHealth(healthData);
    } catch (err: any) {
      console.error('Failed to load system diagnostics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 1500);
    return () => clearInterval(interval);
  }, [selectedPort]);

  const handleConnect = async () => {
    if (!selectedPort) {
      setFeedback({ type: 'error', message: 'No serial port selected. Please select a valid USB port.' });
      return;
    }

    const chosenPortObj = ports.find((p) => p.port === selectedPort);
    if (chosenPortObj?.is_bluetooth) {
      setFeedback({
        type: 'error',
        message: `${selectedPort} is a virtual Bluetooth COM port. Please select your physical Arduino Uno USB port (e.g., COM5) for direct USB CDC telemetry.`,
      });
      return;
    }

    setIsActionPending(true);
    setFeedback({ type: 'info', message: `Attempting USB connection to ${selectedPort} at ${baudRate} baud...` });

    try {
      const res = await connectHardware(selectedPort, baudRate, 'USB');
      setFeedback({
        type: 'success',
        message: `Connected successfully to ${selectedPort}. Background reader active; awaiting telemetry stream.`,
      });
      await loadStatus();
    } catch (err: any) {
      const msg = err.message || 'Port unavailable or hardware offline.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDisconnect = async () => {
    setIsActionPending(true);
    try {
      await disconnectHardware();
      setFeedback({
        type: 'info',
        message: 'Hardware cleanly disconnected. Port released; engine returned to SIMULATION mode.',
      });
      await loadStatus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Disconnect failed: ${err.message}` });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRescan = async () => {
    setLoading(true);
    await loadStatus();
    setFeedback({ type: 'info', message: 'Rescanned system COM ports.' });
  };

  const isConnected = ['LIVE', 'CONNECTED', 'CONNECTING', 'CONNECTED_WAITING_FOR_TELEMETRY', 'STALE'].includes(connStatus);
  const isLive = connStatus === 'LIVE';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Terminal className="w-4 h-4" />
            USB Serial Interface & Hardware Diagnostics
          </div>
          <h1 className="text-xl font-bold text-slate-100">
            Hardware Serial Port & Telemetry Stream Manager
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Direct USB CDC connection manager for Arduino UNO R3 (ATmega328P). Provides dynamic port enumeration,
            exclusive Windows COM handle management, JSON framing validation, and hardware watchdog diagnostics.
          </p>
        </div>

        <button
          onClick={handleRescan}
          disabled={loading || isActionPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#070D18] hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} /> Rescan Ports
        </button>
      </div>

      {/* Dynamic Real-Time Connection & Telemetry Stream Status Banner */}
      {connStatus === 'LIVE' ? (
        <div className="p-3.5 rounded-lg border text-xs flex items-start gap-2.5 bg-emerald-950/80 border-emerald-500/50 text-emerald-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">
              Live Hardware Stream Active: {serialDetails?.port || selectedPort} ({baudRate} baud)
            </div>
            <div className="text-[11px] text-emerald-300 mt-0.5">
              Receiving valid 5 Hz telemetry frames. Sequence #{serialDetails?.last_sequence_id || 0} (
              {serialDetails?.frames_parsed || 0} valid frames, {serialDetails?.corrupted_frames || 0} corrupted).
              Stream freshness: {serialDetails?.last_frame_age_s != null ? `${serialDetails.last_frame_age_s}s ago` : 'now'}.
            </div>
          </div>
        </div>
      ) : connStatus === 'CONNECTED_WAITING_FOR_TELEMETRY' ? (
        <div className="p-3.5 rounded-lg border text-xs flex items-start gap-2.5 bg-cyan-950/80 border-cyan-500/50 text-cyan-200">
          <Activity className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5 animate-spin" />
          <div className="flex-1">
            <div className="font-semibold">
              Connected to {serialDetails?.port || selectedPort}: Background reader active; awaiting telemetry stream.
            </div>
            <div className="text-[11px] text-cyan-300 mt-0.5">
              Port opened successfully. Awaiting initial 5 Hz JSON telemetry frame from Arduino UNO firmware.
            </div>
          </div>
        </div>
      ) : connStatus === 'STALE' ? (
        <div className="p-3.5 rounded-lg border text-xs flex items-start gap-2.5 bg-amber-950/80 border-amber-500/50 text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">
              Hardware Stream STALE on {serialDetails?.port || selectedPort}
            </div>
            <div className="text-[11px] text-amber-300 mt-0.5">
              Port remains open, but no valid telemetry frames have arrived for{' '}
              <strong className="text-amber-100 font-mono">{serialDetails?.last_frame_age_s ?? '?'}s</strong>.
              Last sequence ID: #{serialDetails?.last_sequence_id || 0}.{' '}
              {serialDetails?.reason || 'Hardware uncommunicative; check sensor wires and serial link.'}
            </div>
          </div>
        </div>
      ) : connStatus === 'ERROR' ? (
        <div className="p-3.5 rounded-lg border text-xs flex items-start gap-2.5 bg-rose-950/80 border-rose-500/50 text-rose-200">
          <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">Hardware Interface Error</div>
            <div className="text-[11px] text-rose-300 mt-0.5">
              {serialDetails?.last_error || 'Serial port error occurred.'}
            </div>
          </div>
        </div>
      ) : feedback ? (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
              : 'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          ) : (
            <Activity className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-semibold">{feedback.message}</div>
            {feedback.type === 'error' && feedback.message.includes('Access denied') && (
              <div className="mt-1.5 p-2 bg-black/40 rounded border border-rose-500/30 text-[11px] text-rose-300">
                <strong>Resolution:</strong> Close the <strong>Serial Monitor</strong> or <strong>Serial Plotter</strong> inside the Arduino IDE.
                Windows restricts COM port handles to a single process at a time.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Connection & Port Controller */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left: Port Selector */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Usb className="w-4 h-4 text-cyan-400" /> USB Serial Port
            </h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                isLive
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : connStatus === 'CONNECTING'
                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                  : connStatus === 'STALE'
                  ? 'bg-orange-950 text-orange-400 border-orange-800'
                  : connStatus === 'ERROR'
                  ? 'bg-rose-950 text-rose-400 border-rose-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {connStatus}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 text-[11px] font-semibold">Available COM Ports:</label>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={isConnected || isActionPending}
                className="w-full mt-1 p-2 bg-[#070D18] border border-[#1E293B] rounded-lg text-slate-200 font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              >
                {ports.length > 0 ? (
                  ports.map((p: any) => (
                    <option
                      key={p.port}
                      value={p.port}
                      className={p.is_bluetooth ? 'text-slate-400 bg-slate-900' : 'text-slate-100 bg-[#0F172A]'}
                    >
                      {p.port} — {p.description}{' '}
                      {p.is_arduino ? '★ [Arduino Uno]' : p.is_bluetooth ? '(Bluetooth COM Link)' : '[USB]'}
                    </option>
                  ))
                ) : (
                  <option value="">No COM ports detected</option>
                )}
              </select>
            </div>

            <div>
              <label className="text-slate-400 text-[11px] font-semibold">Baud Rate:</label>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(parseInt(e.target.value))}
                disabled={isConnected || isActionPending}
                className="w-full mt-1 p-2 bg-[#070D18] border border-[#1E293B] rounded-lg text-slate-200 font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              >
                {[9600, 19200, 38400, 57600, 115200].map((b) => (
                  <option key={b} value={b}>
                    {b} baud {b === 9600 ? '(Firmware Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  disabled={isActionPending || !selectedPort}
                  className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Power className="w-4 h-4" /> Connect to Hardware
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  disabled={isActionPending}
                  className="w-full py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Power className="w-4 h-4" /> Disconnect Hardware
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Center: Packet & Protocol Telemetry Stats */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> USB Stream Health & Metrics
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Port Handle / Reader:</span>
              <span className="font-mono font-bold text-slate-200 flex items-center gap-2">
                <span className={serialDetails?.port_open ? 'text-emerald-400' : 'text-slate-500'}>
                  {serialDetails?.port_open ? 'PORT OPEN' : 'CLOSED'}
                </span>
                <span className="text-slate-600">|</span>
                <span className={serialDetails?.reader_alive ? 'text-cyan-400' : 'text-slate-500'}>
                  {serialDetails?.reader_alive ? 'READER ACTIVE' : 'STOPPED'}
                </span>
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Total Valid Frames:</span>
              <span className="text-emerald-400 font-mono font-bold">
                {serialDetails?.frames_parsed ?? serialDetails?.total_frames_parsed ?? 0}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Corrupted / Incomplete:</span>
              <span
                className={`font-mono font-bold ${
                  (serialDetails?.corrupted_frames ?? serialDetails?.total_corrupted_frames ?? 0) > 0
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {serialDetails?.corrupted_frames ?? serialDetails?.total_corrupted_frames ?? 0}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Bytes Received:</span>
              <span className="text-slate-200 font-mono">
                {serialDetails?.bytes_received ?? serialDetails?.total_bytes_received ?? 0} bytes
                {serialDetails?.last_byte_age_s != null ? ` (${serialDetails.last_byte_age_s}s ago)` : ''}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Last Sequence ID:</span>
              <span className="text-cyan-400 font-mono font-bold">
                #{serialDetails?.last_sequence_id || 0}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Last Frame Freshness:</span>
              <span className="text-slate-300 font-mono flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                {serialDetails?.last_frame_age_s != null ? `${serialDetails.last_frame_age_s}s ago` : 'No frames yet'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#1E293B]">
              <span className="text-slate-400">Stream Status Reason:</span>
              <span className="text-slate-300 text-[11px] font-mono text-right truncate max-w-[200px]" title={serialDetails?.reason}>
                {serialDetails?.reason || 'Hardware idle'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Active Motor PWM:</span>
              <span className="text-slate-200 font-mono font-bold">
                {systemHealth?.active_pwm ?? 0} / 255
              </span>
            </div>
          </div>
        </div>

        {/* Right: USB Connection Checklist */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" /> Physical Arduino Setup Guide
          </h3>

          <div className="space-y-2 text-[11px] text-slate-400 leading-relaxed">
            <p>
              1. <strong className="text-slate-200">Close Arduino IDE:</strong> Ensure Serial Monitor and Serial Plotter
              windows are completely closed to free the COM port.
            </p>
            <p>
              2. <strong className="text-slate-200">Connect USB Cable:</strong> Verify your Arduino Uno is recognized on a
              COM port (e.g., <strong className="text-cyan-300 font-mono">COM5</strong>).
            </p>
            <p>
              3. <strong className="text-slate-200">Connect:</strong> Select the port on the left, confirm{' '}
              <strong className="text-slate-200 font-mono">9600 baud</strong>, and click{' '}
              <strong className="text-cyan-400">Connect to Hardware</strong>.
            </p>
            <div className="p-2.5 bg-[#070D18] rounded border border-[#1E293B] text-[10px] text-slate-400 mt-2">
              <span className="text-cyan-400 font-bold">Safe Stopped Boot:</span> Upon physical connection, the firmware
              initializes the L293D in a de-energized state (PWM 0). Use the motor controls on Overview to start.
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Diagnostics Card */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" /> Backend Service Status
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Service Status</div>
            <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {systemHealth?.status || 'ONLINE'}
            </div>
          </div>
          <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Active Transport</div>
            <div className="text-sm font-bold text-cyan-300 mt-1">
              {serialDetails?.transport_type || 'USB'} ({baudRate} baud)
            </div>
          </div>
          <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Active Algorithm</div>
            <div className="text-sm font-bold text-cyan-300 mt-1">
              {systemHealth?.active_algorithm || 'SC-CAMV'}
            </div>
          </div>
          <div className="bg-[#070D18] p-3 rounded-lg border border-[#1E293B]">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">WebSocket Hub</div>
            <div className="text-sm font-bold text-slate-200 mt-1">
              ws://127.0.0.1:8000/ws
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
