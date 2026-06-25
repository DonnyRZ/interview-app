import type { SystemAudioStatus } from "./use-system-audio.js";

type AudioLevelMeterProps = {
  level: number;
  status: SystemAudioStatus;
};

export function AudioLevelMeter({ level, status }: AudioLevelMeterProps) {
  const percentage = Math.max(0, Math.min(100, Math.round(level * 100)));
  const meterState = status === "listening"
    ? "active"
    : status === "error" || status === "unsupported" || status === "ended"
      ? "error"
      : "idle";

  return (
    <div className="audio-level" aria-label="System audio level">
      <div className="audio-level-heading">
        <span>Live level</span>
        <strong>{percentage}%</strong>
      </div>
      <div
        className="audio-level-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className={`audio-level-fill ${meterState}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
