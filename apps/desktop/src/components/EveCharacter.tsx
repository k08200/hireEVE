import { useEffect, useState } from "react";

type Mood = "idle" | "thinking" | "happy" | "alert";

export default function EveCharacter() {
  const [mood, setMood] = useState<Mood>("idle");
  const [blink, setBlink] = useState(false);

  // Blink animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Random mood changes
  useEffect(() => {
    const interval = setInterval(() => {
      const moods: Mood[] = ["idle", "happy", "thinking"];
      setMood(moods[Math.floor(Math.random() * moods.length)]);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const eyeHeight = blink ? 1 : 5;
  const mouthPath =
    mood === "happy"
      ? "M 35 52 Q 42 58 49 52"
      : mood === "thinking"
        ? "M 37 53 L 47 53"
        : "M 36 52 Q 42 56 48 52";

  return (
    <div className={`eve-character eve-mood-${mood}`}>
      <svg width="120" height="120" viewBox="0 0 84 84">
        {/* Body glow */}
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bodyGrad" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#0f172a" />
          </radialGradient>
        </defs>

        {/* Ambient glow */}
        <circle cx="42" cy="42" r="40" fill="url(#glow)" className="eve-glow" />

        {/* Body */}
        <circle cx="42" cy="42" r="28" fill="url(#bodyGrad)" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.6" />

        {/* Eyes */}
        <ellipse cx="34" cy="38" rx="3" ry={eyeHeight} fill="#60a5fa" className="eve-eye" />
        <ellipse cx="50" cy="38" rx="3" ry={eyeHeight} fill="#60a5fa" className="eve-eye" />

        {/* Eye highlights */}
        {!blink && (
          <>
            <circle cx="35.5" cy="36" r="1" fill="white" opacity="0.8" />
            <circle cx="51.5" cy="36" r="1" fill="white" opacity="0.8" />
          </>
        )}

        {/* Mouth */}
        <path d={mouthPath} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />

        {/* Status indicator */}
        <circle cx="58" cy="22" r="3" fill="#22c55e" className="eve-status" />
      </svg>
    </div>
  );
}
