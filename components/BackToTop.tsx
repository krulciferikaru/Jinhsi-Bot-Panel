'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/** Floating button, bottom right, that appears once the page has been scrolled down. */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const lenis = (window as any).__lenis;
    if (lenis) lenis.scrollTo(0, { duration: 0.9 });
    else window.scrollTo({ top: 0, behavior: 'auto' });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button" onClick={toTop} aria-label="Back to top"
          initial={{ opacity: 0, y: 16, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.8 }}
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
          className="btn btn-primary btn-circle fixed bottom-5 right-5 z-40 h-12 w-12 sm:bottom-8 sm:right-8"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5"><path d="M10 16V4m0 0l-5 5m5-5l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
