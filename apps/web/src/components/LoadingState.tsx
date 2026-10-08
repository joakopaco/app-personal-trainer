import "./loading-state.css";

export function LoadingState({
  label = "Cargando…",
  fullScreen = false,
  compact = false,
}: {
  label?: string;
  fullScreen?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`pulso-loading${fullScreen ? " pulso-loading-screen" : ""}${compact ? " pulso-loading-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="pulso-loading-mark" aria-hidden="true">
        <span className="pulso-loading-ring" />
        <span className="pulso-loading-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <span className="pulso-loading-label">{label}</span>
    </div>
  );
}
