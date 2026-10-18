'use client';
import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import Lenis from 'lenis';
import { ToastProvider } from './Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.1 });
    (window as any).__lenis = lenis; // lets "Back to top" scroll through Lenis
    let id = requestAnimationFrame(function raf(t) { lenis.raf(t); id = requestAnimationFrame(raf); });
    return () => { cancelAnimationFrame(id); lenis.destroy(); delete (window as any).__lenis; };
  }, []);
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}
