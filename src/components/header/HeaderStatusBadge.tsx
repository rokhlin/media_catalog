export interface HeaderStatusBadgeProps {
  dotClass: string;
  displayStatus: string;
  fullStatusString: string;
}

export default function HeaderStatusBadge({
  dotClass,
  displayStatus,
  fullStatusString,
}: HeaderStatusBadgeProps) {
  return (
    <div className="status-badge" id="status-panel" title={fullStatusString}>
      <span className={dotClass} id="status-dot"></span>
      <span id="status-text">{displayStatus}</span>
    </div>
  );
}

export { HeaderStatusBadge };
