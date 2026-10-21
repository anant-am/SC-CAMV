# System Architecture Specification

## SC-CAMV: Self-Calibrating, Contradiction-Aware Multifactor Verification for Intelligent Devices

### 1. Architectural Philosophy
The SC-CAMV architecture replaces brittle, single-sensor threshold alarms with an explainable, 5-stage adaptive pipeline. The system operates across three tightly integrated layers:
1. **Embedded Layer (Arduino UNO)**: Hard real-time sensor sampling, basic validation, autonomous local failsafe protection, and streaming JSON telemetry.
2. **Backend Engine (FastAPI & SQLite)**: Gated statistical calibration, persistence accumulation, pairwise interaction matrix evaluation, asymmetric hysteresis state management, persistent SQLite logging, and WebSocket event distribution.
3. **Frontend Dashboard (React + TypeScript + Tailwind CSS)**: Premium, dark industrial command center providing deep data density across 11 functional modules.

---

### 2. End-to-End System Architecture (Mermaid)

```mermaid
graph TD
    subgraph Physical Sensing & Actuation Layer
        S1["ACS712 (Armature Current)"] -->|Analog A1 (nominally 66mV/A)| ARD["Arduino UNO (ATmega328P)"]
        S2["MPU6050 (6-DOF Motion / Vibe)"] -->|I2C A4/A5 (Upside Down)| ARD
        S3["IR Proximity Guard (Obstacle)"] -->|Digital D2 (Active LOW)| ARD
        S4["DHT11 (Ambient Room Air)"] -->|Single-Wire Digital D4| ARD
        
        ARD -->|PWM D10 + Dir D9/D8| DRV["L293D Dual H-Bridge Driver"]
        DRV -->|6-12V Armature Leads| MTR["DC Brushed Motor & Fan Rig"]
        ARD -->|GPIO D12 / D13| LED["Status LEDs (Green Normal / Red Fault)"]
        ARD -->|GPIO D6| BUZZ["Piezo Alarm Buzzer"]
    end

    subgraph Embedded Firmware Autonomous Guard
        ARD --> E_CHECK{"Local Failsafe\nCheck (T>68C or I>2.8A)"}
        E_CHECK -->|Critical Exceeded| E_STOP["Immediate Hardware PWM 0\nActive Dynamic Brake"]
        E_CHECK -->|Nominal| E_TEL["Serialize Telemetry Frame"]
    end

    subgraph Telemetry Transport
        E_TEL -->|9600 Baud UART| BT["HC-05 Bluetooth SPP Module"]
        BT -.->|Wireless RFCOMM| PC_COM["Windows Virtual COM (COM3/COM4)"]
    end

    subgraph Python Backend Engine (FastAPI)
        PC_COM --> SER_MGR["Serial Telemetry Manager\n(Auto-reconnecting Thread)"]
        SIM_ENG["First-Principles DC Motor\nPhysics HIL Simulator"] --> ENGINE["Monitoring Engine Hub"]
        SER_MGR --> ENGINE
        
        subgraph Stage 1: Gated Self-Calibration
            ENGINE --> W_GATE{"Temporal Dwell Gate\n(State == NORMAL & Dwell >= 15s)"}
            W_GATE -->|Open| W_CAL["Online Welford Update\n(mu_i, sigma_i running statistics)"]
            W_GATE -->|Locked| W_FREEZE["Freeze Baseline Reference\n(Contamination Guard)"]
        end
        
        subgraph Stage 2: Temporal Feature Extraction
            W_CAL --> Z_CALC["Compute Z-Scores: z_i = (x_i - mu_i) / sigma_i"]
            W_FREEZE --> Z_CALC
            Z_CALC --> LEAKY["Leaky Persistence Accumulator:\nP_i(t) = min(P_max, beta * P_prev + |z_i| * dt)"]
        end
        
        subgraph Stage 3: Pairwise Contradiction Fusion (GC-PWCE)
            LEAKY --> MATRIX["Pairwise Physical Interaction Matrix:\nS_corrob = sum(C_jk * P_j * P_k for C_jk > 0)\nS_contradict = sum(|C_jk| * P_j * P_k for C_jk < 0)"]
            MATRIX --> RISK_SCORE["Normalized Risk Score R in [0, 100]:\nR = 100 * sigma(w^T P + lambda_c * S_corrob - lambda_d * S_contradict)"]
        end
        
        subgraph Stage 4: Asymmetric Hysteresis State Machine
            RISK_SCORE --> HYST{"Asymmetric State Engine\n(Escalation: 0.6s dwell\nDe-escalation: 4.0s dwell)"}
            HYST --> STATE["NORMAL | WATCH | WARNING | HIGH_RISK | CRITICAL"]
            STATE --> PROB["3-Strike Bounded Recovery Probation\n(Hard Lockout Guard)"]
        end
        
        subgraph Stage 5: Protective Action Feedback
            PROB --> ACT_DISPATCH["Actuation Dispatch:\n- Derate PWM 60%\n- Derate PWM 30%\n- Emergency Stop (PWM 0)\n- Manual Lockout Reset"]
            ACT_DISPATCH -->|Actuation Command| SER_MGR
        end
        
        PROB --> DB["SQLite 3 Database (WAL Mode)\n(Telemetry, Decisions, Baseline History)"]
        PROB --> WS_HUB["Async WebSocket Hub (/ws)"]
    end

    subgraph React TypeScript Frontend Dashboard
        WS_HUB --> WS_CLIENT["Auto-Reconnecting WebSocket Client"]
        REST["FastAPI REST Endpoints (/api/v1/*)"] --> API_CLIENT["Axios/Fetch Client"]
        
        WS_CLIENT --> UI_SHELL["Industrial UI Shell (App.tsx)"]
        API_CLIENT --> UI_SHELL
        
        UI_SHELL --> P1["Overview Dashboard"]
        UI_SHELL --> P2["Live Monitor (Scrolling Waveforms)"]
        UI_SHELL --> P3["Algorithm Explorer (5-Stage Visualizer)"]
        UI_SHELL --> P4["Scenario Lab (11 HIL Scenarios)"]
        UI_SHELL --> P4_2["Fault Injection Lab (17 Reversible Faults)"]
        UI_SHELL --> P5["Experiments Protocol (Exp A through J)"]
        UI_SHELL --> P6["Evaluation & Reports (Confusion Matrix & Benchmarks)"]
        UI_SHELL --> P7["Calibration Command Center"]
        UI_SHELL --> P8["Device & Pinout Architecture"]
        UI_SHELL --> P9["History & Audit Events Log"]
        UI_SHELL --> P10["System Diagnostics & COM Scanner"]
        UI_SHELL --> P11["Engine Hyperparameter Settings"]
    end
```

---

### 3. Layer Separation & Guarantees
1. **Physical Failsafe Independence**:
   - The Arduino UNO embedded firmware does not require active connection to the Python backend to execute protective motor stops.
   - If armature current exceeds 2.60A or vibration exceeds 2.40g RMS, the ATmega328P autonomously asserts active dynamic braking in hardware.
2. **Deterministic Processing**:
   - The backend engine executes at a fixed nominal rate (5 Hz = 200 ms per step).
   - In Simulation mode, first-principles lumped thermal and electromechanical ODEs run synchronously.
3. **Contamination Guard**:
   - Baseline statistical updates are mathematically prevented whenever the system is not in a verified steady-state NORMAL condition for at least $H_{\min} = 15.0$ seconds.
