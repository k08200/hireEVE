import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import EveCharacter from "./components/EveCharacter";
import "./styles.css";

function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wanderInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wandering, setWandering] = useState(true);

  // Drag the window by dragging the character
  const handleMouseDown = async () => {
    setWandering(false);
    if (wanderInterval.current) clearInterval(wanderInterval.current);
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // ignore
    }
    // Resume wandering after 10 seconds of inactivity
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setWandering(true), 10000);
  };

  // Open chat in a separate window
  const openChat = async () => {
    if (chatOpen) return;
    setChatOpen(true);

    try {
      const mainPos = await getCurrentWindow().outerPosition();

      const chatWin = new WebviewWindow("chat", {
        url: "/chat.html",
        title: "EVE Chat",
        width: 380,
        height: 520,
        x: mainPos.x - 200,
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

  // Wander: randomly move the window around the screen
  useEffect(() => {
    if (!wandering) return;

    const wander = async () => {
      const win = getCurrentWindow();
      try {
        const pos = await win.outerPosition();
        // Small random movement
        const dx = Math.round((Math.random() - 0.5) * 30);
        const dy = Math.round((Math.random() - 0.5) * 20);
        const newX = Math.max(0, pos.x + dx);
        const newY = Math.max(0, pos.y + dy);
        await win.setPosition(new (await import("@tauri-apps/api/dpi")).LogicalPosition(newX, newY));
      } catch {
        // ignore
      }
    };

    wanderInterval.current = setInterval(wander, 2000);
    return () => {
      if (wanderInterval.current) clearInterval(wanderInterval.current);
    };
  }, [wandering]);

  return (
    <div className="character-window" onMouseDown={handleMouseDown}>
      <div className="character-clickable" onClick={openChat}>
        <EveCharacter />
      </div>
      <p className="character-label">EVE</p>
    </div>
  );
}

export default App;
