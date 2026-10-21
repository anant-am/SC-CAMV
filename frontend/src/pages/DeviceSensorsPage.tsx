import React from 'react';
import {
  Cpu,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Radio,
  CheckCircle2,
  Layers,
  Gauge,
  Activity,
  HardDrive,
  Eye,
  CloudRain,
  Volume2,
} from 'lucide-react';

interface PinRow {
  pin: string;
  component: string;
  role: string;
  type: string;
  voltage: string;
  notes: string;
}

const PIN_MAPPINGS: PinRow[] = [
  {
    pin: 'D10',
    component: 'L293D Motor Driver (EN1)',
    role: 'Motor Speed Control (PWM)',
    type: 'PWM Output (Timer 1)',
    voltage: '5V Logic',
    notes: 'Default demonstration command: PWM 100 out of 255.',
  },
  {
    pin: 'D9',
    component: 'L293D Motor Driver (IN1)',
    role: 'Motor Direction Terminal 1',
    type: 'Digital Output',
    voltage: '5V Logic',
    notes: 'High for forward rotation; low for braking/stop.',
  },
  {
    pin: 'D8',
    component: 'L293D Motor Driver (IN2)',
    role: 'Motor Direction Terminal 2',
    type: 'Digital Output',
    voltage: '5V Logic',
    notes: 'Low for forward rotation; high for reverse.',
  },
  {
    pin: 'D2',
    component: 'IR Obstacle Sensor',
    role: 'Stationary Proximity Guard',
    type: 'Digital Input',
    voltage: '5V VCC',
    notes: 'Active LOW: LOW = object detected, HIGH = path clear. Fixed mount near fan, NOT for turn counting.',
  },
  {
    pin: 'D4',
    component: 'DHT11 Environmental Sensor',
    role: 'Ambient Room Temp & Relative Humidity',
    type: 'Single-Wire Digital',
    voltage: '5V VCC',
    notes: 'Sampled every 1.5s; provides ambient background context, NOT motor winding temp.',
  },
  {
    pin: 'A1',
    component: 'ACS712 Current Sensor',
    role: 'Motor Armature Current',
    type: 'Analog Input',
    voltage: '5V VCC (~2.5V zero offset)',
    notes: 'Wired in series with motor armature supply; zero-calibrated only when motor is stopped.',
  },
  {
    pin: 'A4 (SDA)',
    component: 'MPU6050 6-DOF IMU',
    role: 'Vibration & Rotor Acceleration',
    type: 'I²C Bus (Data)',
    voltage: '5V / 3.3V Breakout',
    notes: 'Mounted on motor housing with automatic gravity orientation detection (Upright ≈ +1.0g, Inverted ≈ -1.0g). Vibration RMS computed minus gravity.',
  },
  {
    pin: 'A5 (SCL)',
    component: 'MPU6050 6-DOF IMU',
    role: 'Vibration & Rotor Acceleration',
    type: 'I²C Bus (Clock)',
    voltage: '5V / 3.3V Breakout',
    notes: '100 kHz I²C clock; address 0x68 with WHO_AM_I identity validation.',
  },
  {
    pin: 'D12',
    component: 'Green Status LED',
    role: 'Normal Monitoring Indicator',
    type: 'Digital Output',
    voltage: '5V via 220–330Ω resistor',
    notes: 'Active when monitoring conditions and required sensors are healthy.',
  },
  {
    pin: 'D13',
    component: 'Red Warning LED',
    role: 'Confirmed Warning / Fault Indicator',
    type: 'Digital Output',
    voltage: '5V via 220–330Ω resistor',
    notes: 'Active upon overcurrent, excessive vibration, obstacle alert, or emergency stop.',
  },
  {
    pin: 'D6',
    component: 'Piezo Alarm Buzzer',
    role: 'Audible Hazard Annunciator',
    type: 'Digital Output',
    voltage: '5V Logic',
    notes: 'Non-blocking pulsed alarm control for warnings; solid tone for critical trips.',
  },
  {
    pin: 'D11',
    component: 'HC-05 Bluetooth Module',
    role: 'SoftwareSerial RX (from HC-05 TXD)',
    type: 'Digital Input',
    voltage: '5V Tolerant',
    notes: 'Optional alternate transport to primary USB Serial.',
  },
  {
    pin: 'D7',
    component: 'HC-05 Bluetooth Module',
    role: 'SoftwareSerial TX (to HC-05 RXD)',
    type: 'Digital Output',
    voltage: '3.3V via resistor divider',
    notes: 'Level shifted with 1k/2k divider to protect 3.3V HC-05 RX input.',
  },
];

export const DeviceSensorsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1E293B]">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            Hardware Architecture & Pinout Specification
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Confirmed physical mapping for Arduino UNO R3, L293D motor driver, and multifactor sensing suite.
          </p>
        </div>
      </div>

      {/* LM35 Decommissioning Notice */}
      <div className="p-4 rounded-xl bg-[#13111C] border border-purple-900/50 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <strong className="text-purple-200">Hardware Specification Notice: LM35 Decommissioned</strong>
          <p className="text-slate-300 mt-1 leading-relaxed">
            The LM35 contact temperature sensor has been permanently decommissioned and removed from the active SC-CAMV configuration. The DHT11 sensor on D4 strictly provides ambient room context and is never misrepresented as direct motor casing temperature.
          </p>
        </div>
      </div>

      {/* Pinout Table */}
      <div className="p-5 rounded-xl bg-[#111827] border border-[#1E293B] shadow-sm">
        <h2 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" /> Complete Hardware Pin Assignments
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-slate-400 font-semibold bg-[#0A0F1D]">
                <th className="py-2.5 px-3">Pin</th>
                <th className="py-2.5 px-3">Component</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Signal Type</th>
                <th className="py-2.5 px-3">Voltage / Level</th>
                <th className="py-2.5 px-3">Engineering Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-slate-300">
              {PIN_MAPPINGS.map((row, idx) => (
                <tr key={idx} className="hover:bg-[#131E35] transition-colors">
                  <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">{row.pin}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-200">{row.component}</td>
                  <td className="py-2.5 px-3 text-slate-300">{row.role}</td>
                  <td className="py-2.5 px-3 text-slate-400">{row.type}</td>
                  <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{row.voltage}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px] leading-relaxed">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety & Power Supply Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <h3 className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" /> Power Domain Isolation Rules
          </h3>
          <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
            <li>Never connect the motor driver 12V terminal to Arduino 5V.</li>
            <li>Never drive the DC motor directly from Arduino GPIO pins.</li>
            <li>Common ground must be bonded between Arduino GND and driver power supply.</li>
            <li>18650 battery output voltage and polarity must be verified before attachment.</li>
          </ul>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <h3 className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-cyan-400" /> MPU6050 Orientation Handling
          </h3>
          <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
            <li>MPU6050 is mounted on the stationary motor housing bracket with automatic gravity orientation detection.</li>
            <li>Stationary gravity vector reads Az ≈ +1.0g (Upright) or Az ≈ -1.0g (Inverted).</li>
            <li>Vibration RMS is isolated by vector subtraction: |√(Ax² + Ay² + Az²) - 1.0g|.</li>
            <li>Firmware must never be attached directly to rotating fan blades.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
