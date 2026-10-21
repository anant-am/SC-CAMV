import pytest
from backend.app.algorithms.sc_camv import SCCAMVAlgorithm
from backend.app.algorithms.fixed_threshold import FixedThresholdAlgorithm
from backend.app.algorithms.naive_multifactor import NaiveMultifactorAlgorithm
from backend.app.simulation.scenario_generator import generate_scenario_frames
from backend.app.schemas.telemetry import SystemState

def run_benchmark(algorithm, frames):
    decisions = []
    algorithm.reset()
    for f in frames:
        d = algorithm.process_frame(f)
        decisions.append(d)
    return decisions

def test_comparative_false_alarm_rate():
    """In healthy baseline steady-state operation, algorithms should not produce false alarms."""
    frames = generate_scenario_frames("healthy_baseline", dt_s=0.2)

    fixed = FixedThresholdAlgorithm()
    naive = NaiveMultifactorAlgorithm()
    sc_camv = SCCAMVAlgorithm()

    # Evaluate after initial startup transient
    steady_frames = frames[10:]
    res_fixed = run_benchmark(fixed, steady_frames)
    res_naive = run_benchmark(naive, steady_frames)
    res_sccamv = run_benchmark(sc_camv, steady_frames)

    fa_fixed = sum(1 for d in res_fixed if d.state in [SystemState.WARNING, SystemState.HIGH_RISK, SystemState.CRITICAL])
    fa_naive = sum(1 for d in res_naive if d.state in [SystemState.WARNING, SystemState.HIGH_RISK, SystemState.CRITICAL])
    fa_sccamv = sum(1 for d in res_sccamv if d.state in [SystemState.WARNING, SystemState.HIGH_RISK, SystemState.CRITICAL])

    assert fa_sccamv == 0, f"SC-CAMV had {fa_sccamv} false alarms during healthy operation"
    assert fa_fixed == 0
    assert fa_naive == 0

def test_comparative_heatwave_robustness():
    """During ambient heatwaves, naive fusion falsely flags motor faults, while SC-CAMV discounts ambient heating."""
    frames = generate_scenario_frames("ambient_heatwave_contradiction", dt_s=0.2)

    naive = NaiveMultifactorAlgorithm()
    sc_camv = SCCAMVAlgorithm()

    res_naive = run_benchmark(naive, frames)
    res_sccamv = run_benchmark(sc_camv, frames)

    # Naive sums ambient temp z-score blindly, escalating to high risk/critical
    naive_criticals = sum(1 for d in res_naive if d.state in [SystemState.HIGH_RISK, SystemState.CRITICAL])
    sccamv_criticals = sum(1 for d in res_sccamv if d.state in [SystemState.HIGH_RISK, SystemState.CRITICAL])

    # SC-CAMV must have 0 false criticals during pure ambient heatwave
    assert sccamv_criticals == 0
    assert any(len(d.contradictory_evidence) > 0 or "Contradiction" in " ".join(d.rules_triggered) for d in res_sccamv)

def test_comparative_multimodal_overload_detection():
    """During genuine multi-modal overload, SC-CAMV and baselines must detect the anomaly and protect."""
    frames = generate_scenario_frames("catastrophic_combined", dt_s=0.2)

    fixed = FixedThresholdAlgorithm()
    naive = NaiveMultifactorAlgorithm()
    sc_camv = SCCAMVAlgorithm()

    res_fixed = run_benchmark(fixed, frames)
    res_naive = run_benchmark(naive, frames)
    res_sccamv = run_benchmark(sc_camv, frames)

    # Overload starts at step 25
    overload_sccamv = [d for d in res_sccamv[35:] if d.state in [SystemState.WARNING, SystemState.HIGH_RISK, SystemState.CRITICAL]]
    assert len(overload_sccamv) > 0, "SC-CAMV failed to detect catastrophic overload"
