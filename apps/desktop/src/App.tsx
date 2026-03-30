import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ChatPanel from "./components/ChatPanel";
import EveCharacter from "./components/EveCharacter";
import TitleBar from "./components/TitleBar";
import "./styles.css";

type View = "character" | "chat";

function App() {
  const [view, setView] = useState<View>("character");
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = async () => {
    setIsDragging(true);
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // ignore
    }
    setIsDragging(false);
  };

  return (
    <div className="app-container">
      <TitleBar />
      {view === "character" ? (
        <div
          className="character-view"
          onMouseDown={startDrag}
          onClick={() => !isDragging && setView("chat")}
        >
          <EveCharacter />
          <p className="hint-text">Click to chat</p>
        </div>
      ) : (
        <ChatPanel onClose={() => setView("character")} />
      )}
    </div>
  );
}

export default App;
