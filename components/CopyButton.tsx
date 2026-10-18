'use client';
import { useState } from 'react';

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { window.prompt('Copy this link:', text); }
  }
  return (
    <button type="button" className="btn" onClick={copy} aria-live="polite">
      {done ? 'Copied!' : label}
    </button>
  );
}
