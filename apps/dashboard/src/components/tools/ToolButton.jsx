export default function ToolButton({
  label,
  active = false,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      className={`map-tool-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}