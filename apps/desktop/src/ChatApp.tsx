import { getCurrentWindow } from "@tauri-apps/api/window";
import ChatPanel from "./components/ChatPanel";
import "./styles.css";

function ChatApp() {
  return (
    <div className="chat-window">
      <div
        className="chat-title-bar"
        onMouseDown={() => getCurrentWindow().startDragging()}
      >
        <div className="chat-title-info">
          <div className="chat-dot-green" />
          <span>EVE</span>
        </div>
        <button
          className="chat-title-close"
          onClick={() => getCurrentWindow().close()}
        >
          ✕
        </button>
      </div>
      <ChatPanel onClose={() => getCurrentWindow().close()} />
    </div>
  );
}

export default ChatApp;
