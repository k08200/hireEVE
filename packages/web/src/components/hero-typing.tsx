"use client";

import { useEffect, useState } from "react";

const PHRASES = [
  "email, calendar, tasks",
  "reports, memos, contacts",
  "Slack, Notion, web search",
  "scheduling, reminders",
  "daily briefings",
];

export default function HeroTyping() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = PHRASES[phraseIdx];

    if (!deleting && charIdx < phrase.length) {
      const timer = setTimeout(() => setCharIdx((c) => c + 1), 60);
      return () => clearTimeout(timer);
    }

    if (!deleting && charIdx === phrase.length) {
      const timer = setTimeout(() => setDeleting(true), 2000);
      return () => clearTimeout(timer);
    }

    if (deleting && charIdx > 0) {
      const timer = setTimeout(() => setCharIdx((c) => c - 1), 30);
      return () => clearTimeout(timer);
    }

    if (deleting && charIdx === 0) {
      setDeleting(false);
      setPhraseIdx((p) => (p + 1) % PHRASES.length);
    }
  }, [charIdx, deleting, phraseIdx]);

  const text = PHRASES[phraseIdx].slice(0, charIdx);

  return (
    <span className="text-blue-400">
      {text}
      <span className="inline-block w-[2px] h-[1em] bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
    </span>
  );
}
