import { getCurrentWindow } from "@tauri-apps/api/window";

export default function TitleBar() {
  const win = getCurrentWindow();

  return (
    <div
      className="title-bar"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        win.startDragging();
      }}
    >
      <span className="title-bar-label">EVE</span>
      <div className="title-bar-buttons">
        <button
          className="title-btn"
          onClick={() => win.minimize()}
          title="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect y="4" width="10" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>
        <button
          className="title-btn title-btn-close"
          onClick={() => win.hide()}
          title="Hide"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
