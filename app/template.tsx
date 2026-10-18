'use client';
import { motion } from 'motion/react';

/** Re-mounts on every navigation, giving each page a soft entrance. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}>
      {children}
    </motion.div>
  );
}
