from abc import ABC, abstractmethod
from typing import List, Optional
from backend.app.schemas.telemetry import RawSensorFrame, DecisionExplanation, CalibrationProfile

class BaseHealthAlgorithm(ABC):
    @abstractmethod
    def get_name(self) -> str:
        """Return the descriptive name of the algorithm."""
        pass

    @abstractmethod
    def process_frame(self, frame: RawSensorFrame, current_time_ms: Optional[int] = None) -> DecisionExplanation:
        """Process an incoming sensor frame and return a transparent decision explanation."""
        pass

    @abstractmethod
    def calibrate(self, frames: List[RawSensorFrame]) -> CalibrationProfile:
        """Compute an initial baseline calibration from healthy training frames."""
        pass

    @abstractmethod
    def reset(self) -> None:
        """Reset internal state, accumulators, and history."""
        pass
