# Project Demonstration & Viva Defense Guide

## SC-CAMV Framework: Presentation Script & Technical Q&A

---

### Part 1: Recommended End-to-End Demonstration Sequence (5-7 Minutes)

#### Step 1: System Boot & Nominal Operation (1 Minute)
1. Start the system:
   ```powershell
   python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```
2. Open `http://localhost:5173` in the browser.
3. Show the **Overview Page**:
   - Point to the live metric cards: steady-state motor casing temperature (~47°C), armature current (~1.08A), vibration (~0.08g), shaft speed (~1360 RPM).
   - Point to the top bar: Risk Score is low (< 10/100), State is `NORMAL`, Motor PWM is 255 (100% duty).

#### Step 2: The Core Contribution — Ambient Heatwave Contradiction Rejection (2 Minutes)
1. Navigate to **Scenario Lab** tab.
2. Select `Ambient Heatwave (Thermal Contradiction)` and click **Run**.
3. In the top bar, switch the algorithm dropdown to `Fixed Threshold`:
   - Watch the fixed-threshold system trip at 50°C into `WARNING` and then `CRITICAL`.
   - Point out to the evaluator: *"The motor is not faulty. The ambient room is simply hot. Fixed thresholds create an unnecessary shutdown."*
4. Switch the algorithm dropdown to `SC-CAMV (Proposed GC-PWCE)`:
   - Point to the **Algorithm Explorer** tab.
   - Show Stage 3 (Pairwise Interaction): Ambient temperature DHT11 and casing temperature LM35 have contradiction factor $C_{jk} = -0.95$.
   - The contradiction term $S_{\text{contradict}}$ discounts the anomaly risk score, keeping the motor safely running in `NORMAL`/`WATCH`.

#### Step 3: True Corroborative Anomaly & Dynamic Braking (1.5 Minutes)
1. Navigate back to **Scenario Lab**.
2. Select `Mechanical Overload & Rotor Stall` and click **Run**.
3. Show the live waveform: Current spikes to 2.2A while RPM drops to 350.
4. Point out the corroboration term: $C(\text{current}, \text{rpm}) = +0.85$.
5. The state accelerates to `CRITICAL` in 1.2 seconds, triggering `EMERGENCY_SHUTDOWN` (PWM 0).

#### Step 4: Gated Calibration Contamination Proof (1 Minute)
1. Navigate to the **Calibration** tab.
2. Show the **Dwell Gate State**:
   - When the system is in `WARNING` or `CRITICAL`, the gate is strictly **LOCKED**.
   - Explain to the examiner: *"Standard adaptive algorithms poison their baseline during slow degradation. SC-CAMV mathematically locks Welford updates until 15 consecutive seconds of verified NORMAL operation are satisfied."*

#### Step 5: Comparative Evaluation & Confusion Matrix (1 Minute)
1. Navigate to the **Evaluation & Reports** tab.
2. Highlight the empirical benchmark table:
   - False Alarm Rate: Fixed Threshold (33.3%) vs SC-CAMV (0.0%).
   - Show the 5x5 confusion matrix demonstrating 93.8% diagonal classification accuracy.

---

### Part 2: Viva Defense Questions and Defensible Answers

#### Q1: Why did you not use deep learning or an LSTM / autoencoder for this anomaly detection task?
> **Answer**:  
> "Industrial edge devices and microcontrollers like the Arduino UNO (ATmega328P) have strict computational constraints (2 KB of SRAM, 16 MHz clock, no FPU). Deep learning models are computationally prohibitive on such hardware, act as black boxes with unexplainable decision logic, and are prone to hallucinations or unpredictable edge-case behavior.  
> In safety-critical embedded systems, explainability and determinism are paramount. GC-PWCE provides $O(N^2)$ deterministic computation, fully auditable mathematical derivations, and transparent human-readable decision explanations while executing comfortably within 200 ms cycles."

#### Q2: How does your system prevent baseline contamination when a motor experiences slow, gradual thermal degradation?
> **Answer**:  
> "Naive adaptive filters update their reference mean continuously, absorbing slow degradation into the normal baseline until a catastrophic failure occurs.  
> SC-CAMV implements a strict **Temporal Dwell Gate**:
> $$\text{Gate}(t) = (\text{State} == \text{NORMAL}) \land (\text{Dwell}_{\text{NORMAL}} \ge H_{\min})$$
> As soon as an anomaly produces even a minor elevation ($R(t) \ge 30.0$ or $|z_i| > 2.0$), the system transitions to `WATCH` or `WARNING`. This immediately de-asserts the gate signal and **strictly freezes** all online Welford statistical updates, mathematically guaranteeing zero baseline drift during abnormal operations."

#### Q3: What is the computational advantage of GC-PWCE over Dempster-Shafer Evidence Theory?
> **Answer**:  
> "Classical Dempster-Shafer evidence theory combines belief masses across a frame of discernment $\Theta$, which scales exponentially with complexity $O(2^{|\Theta|})$. Furthermore, under high conflict, Dempster's rule produces well-documented counter-intuitive anomalies (Zadeh's paradox).  
> GC-PWCE uses a symmetric $N \times N$ pairwise physical interaction matrix $C \in \mathbb{R}^{N \times N}$ where $C_{jk} \in [-1.0, +1.0]$. This achieves linear/quadratic complexity $O(N^2)$, requires no combinatorial mass redistribution, and maps directly to physical laws (e.g. Joule heating, torque-speed curves)."

#### Q4: What happens if the host PC crashes or the Bluetooth link drops? Is the physical motor left unprotected?
> **Answer**:  
> "No. The Arduino UNO embedded firmware has a local autonomous failsafe watchdog built directly into its ATmega328P loop. If casing temperature exceeds 68°C or current exceeds 2.8A, the microcontroller immediately forces PWM to 0 and asserts dynamic braking in hardware independent of host communication."
