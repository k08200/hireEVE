import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import EveCharacter from "./components/EveCharacter";
import "./styles.css";

function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wanderInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wandering, setWandering] = useState(true);

  // Hide the click hint after 5 seconds
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const handleMouseDown = async () => {
    setWandering(false);
    if (wanderInterval.current) clearInterval(wanderInterval.current);
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // ignore
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setWandering(true), 10000);
  };

  const openChat = async () => {
    if (chatOpen) return;
    setChatOpen(true);

    try {
      // Check if a chat window already exists
      const existing = await WebviewWindow.getByLabel("chat");
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const mainPos = await getCurrentWindow().outerPosition();

      const chatWin = new WebviewWindow("chat", {
        url: "/chat.html",
        title: "EVE Chat",
        width: 400,
        height: 560,
        x: mainPos.x - 220,
        y: mainPos.y,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        shadow: false,
        minWidth: 320,
        minHeight: 400,
      });

      chatWin.once("tauri://destroyed", () => {
        setChatOpen(false);
      });
    } catch {
      setChatOpen(false);
    }
  };

  // Gentle wandering
  useEffect(() => {
    if (!wandering) return;

    const wander = async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const dx = Math.round((Math.random() - 0.5) * 16);
        const dy = Math.round((Math.random() - 0.5) * 10);
        const newX = Math.max(0, pos.x + dx);
        const newY = Math.max(0, pos.y + dy);
        const { LogicalPosition } = await import("@tauri-apps/api/dpi");
        await win.setPosition(new LogicalPosition(newX, newY));
      } catch {
        // ignore
      }
    };

    wanderInterval.current = setInterval(wander, 3000);
    return () => {
      if (wanderInterval.current) clearInterval(wanderInterval.current);
    };
  }, [wandering]);

  return (
    <div className="character-window" onMouseDown={handleMouseDown}>
      <div className="character-clickable" onClick={openChat}>
        <EveCharacter />
      </div>
      {showHint && !chatOpen && (
        <p className="character-hint">Click to chat</p>
      )}
      {!showHint && (
        <p className="character-label">EVE</p>
      )}
    </div>
  );
}

export default App;
