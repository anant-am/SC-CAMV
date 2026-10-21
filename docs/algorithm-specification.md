# Algorithm Specification: GC-PWCE (SC-CAMV)

## Gated Calibration, Pairwise Contradiction Evaluation (GC-PWCE)

### 1. Abstract & Novelty Definition
Fixed-threshold industrial monitoring systems suffer from two fatal weaknesses:
1. **False Trips during Environmental Disturbances**: An ambient heatwave passively increases motor casing temperature, tripping a fixed 50°C alarm even though motor armature current and vibration indicate perfectly normal electromechanical operation.
2. **Slow Fault Baseline Poisoning**: Simple moving-average adaptive filters absorb slow degradation trends into their reference baseline, eventually classifying a dangerously degraded machine as "normal".

The **GC-PWCE** algorithm addresses both vulnerabilities through:
- **Gated Welford Self-Calibration**: Baseline statistics are updated if and only if the machine has remained continuously in a verified `NORMAL` operational state for a minimum dwell window ($H_{\min} = 15.0\text{s}$). If any anomaly emerges, baseline updates are strictly frozen.
- **Pairwise Physical Interaction Matrix**: Instead of combinatorial Dempster-Shafer belief mass explosion ($2^{|\Theta|}$), cross-sensor evidence is fused via an $N \times N$ bounded physical interaction matrix $C_{jk} \in [-1.0, +1.0]$, explicitly distinguishing corroboration ($C_{jk} > 0$) from contradiction ($C_{jk} < 0$).
- **Leaky Persistence Accumulator**: Fleeting measurement spikes are rejected via a leaky decay accumulator $P_i(t) = \min(P_{\max}, \beta P_{\text{prev}} + |z_i| \Delta t)$.
- **Asymmetric Multi-Band Hysteresis**: Fast escalation ($0.6\text{s}$) for rapid safety shutdown combined with slow de-escalation ($4.0\text{s}$) to eliminate state chattering.
- **3-Strike Bounded Recovery Lockout**: Prevents dangerous autonomous restart cycling.

---

### 2. Mathematical Formulation

#### 2.1 Stage 1: Sensor Validity & Physical Bounds
For each sensor reading $x_i(t)$ ($i \in \{1, \dots, N\}$):
$$x_i(t) \in [B_{\min, i}, B_{\max, i}], \quad \text{Status}_i = \begin{cases} \text{VALID} & \text{if finite and bounded} \\ \text{INVALID} & \text{otherwise} \end{cases}$$
If a sensor drops out, its evidence persistence is clamped to zero, and the system flags a data-quality degradation rather than fabricating an artificial zero-reading fault.

#### 2.2 Stage 2: Gated Online Calibration (Contamination Guard)
Online updates to running mean $\mu_i$ and variance $\sigma_i^2$ use Welford's algorithm modulated by the Boolean gate condition:
$$\text{Gate}(t) = \Big(\text{State}(t) == \text{NORMAL}\Big) \land \Big(\text{Dwell}_{\text{NORMAL}}(t) \ge H_{\min}\Big)$$
When $\text{Gate}(t) == \text{TRUE}$:
$$\mu_i(t) = (1 - \alpha) \mu_i(t - \Delta t) + \alpha x_i(t)$$
$$\sigma_i^2(t) = (1 - \alpha) \sigma_i^2(t - \Delta t) + \alpha \Big(x_i(t) - \mu_i(t)\Big)^2$$
When $\text{Gate}(t) == \text{FALSE}$, $\mu_i(t) = \mu_i(t - \Delta t)$ and $\sigma_i^2(t) = \sigma_i^2(t - \Delta t)$.

#### 2.3 Stage 3: Temporal Persistence Accumulator
Normalized deviation (Z-score):
$$z_i(t) = \frac{x_i(t) - \mu_i(t)}{\max(\sigma_i(t), \epsilon)}, \quad \epsilon = 10^{-4}$$
Evidence increment:
$$\Delta P_i(t) = \begin{cases} (|z_i(t)| - \gamma) \Delta t & \text{if } |z_i(t)| > \gamma \\ 0 & \text{otherwise} \end{cases}$$
where $\gamma = 2.0$ standard deviations.
The leaky accumulator update:
$$P_i(t) = \min\Big(P_{\max}, \beta P_i(t - \Delta t) + \Delta P_i(t)\Big)$$
where $\beta = 0.85$ (decay factor), $P_{\max} = 5.0$, and $\Delta t = 0.2\text{s}$.

#### 2.4 Stage 4: Pairwise Interaction Matrix Fusion
Let $C \in \mathbb{R}^{N \times N}$ be the symmetric cross-sensor interaction matrix with entries $C_{jk} \in [-1.0, +1.0]$.
The corroboration score $S_{\text{corrob}}$ and contradiction score $S_{\text{contradict}}$ are:
$$S_{\text{corrob}}(t) = \sum_{j=1}^{N} \sum_{k=j+1}^{N} \max(0, C_{jk}) \cdot P_j(t) \cdot P_k(t)$$
$$S_{\text{contradict}}(t) = \sum_{j=1}^{N} \sum_{k=j+1}^{N} \max(0, -C_{jk}) \cdot P_j(t) \cdot P_k(t)$$

#### Physical Coupling Matrix Weights:
```
           temp_c   curr_a   vibe_g    rpm   amb_temp
temp_c   [  1.00     +0.70    +0.50   -0.40    -0.95  ]
curr_a   [ +0.70     1.00     +0.60   +0.85     0.00  ]
vibe_g   [ +0.50    +0.60     1.00    -0.30     0.00  ]
rpm      [ -0.40    +0.85    -0.30     1.00     0.00  ]
amb_temp [ -0.95     0.00     0.00     0.00     1.00  ]
```
*Note the critical entry:* $C(\text{temp\_c}, \text{amb\_temp}) = -0.95$. When ambient temperature rises, motor casing temp rises passively. This generates strong contradiction evidence ($S_{\text{contradict}}$), discounting anomaly risk.

#### Composite Anomaly Risk Score $R(t) \in [0, 100]$:
$$E_{\text{net}}(t) = \sum_{i=1}^{N} w_i P_i(t) + \lambda_{\text{corrob}} S_{\text{corrob}}(t) - \lambda_{\text{contradict}} S_{\text{contradict}}(t)$$
$$R(t) = 100 \times \frac{1}{1 + e^{-k_s (E_{\text{net}}(t) - E_0)}}$$
where $k_s = 0.8$, $E_0 = 2.5$, $\lambda_{\text{corrob}} = 0.25$, $\lambda_{\text{contradict}} = 0.40$.

---

### 3. Stage 5: Asymmetric State Transitions & Protective Action

#### Threshold Boundaries:
- $R < 30.0$: `NORMAL` (Motor PWM 255 / 100%)
- $30.0 \le R < 50.0$: `WATCH` (Increased telemetry logging)
- $50.0 \le R < 70.0$: `WARNING` (Derate PWM to 153 / 60%)
- $70.0 \le R < 85.0$: `HIGH_RISK` (Derate PWM to 76 / 30%)
- $R \ge 85.0$: `CRITICAL` (Immediate emergency stop PWM 0, active dynamic braking)

#### Hysteresis Timing Constraints:
- **Upward Escalation**: Requires risk score to remain elevated for at least $D_{\text{up}} = 0.6\text{s}$ (3 consecutive samples).
- **Downward Recovery**: Requires risk score to remain below threshold for at least $D_{\text{down}} = 4.0\text{s}$ (20 consecutive samples).
- **Hard Lockout**: If the machine transitions to `CRITICAL` 3 times within a 60-second window, the system enters `HARD_LOCKOUT`, permanently cutting motor power until an explicit operator reset signal is dispatched.
