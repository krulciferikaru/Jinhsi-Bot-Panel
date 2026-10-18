'use client';
import { createContext, useCallback, useContext, useState } from 'react';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const Ctx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast toast-end z-50" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`alert ${t.kind === 'success' ? 'alert-success' : t.kind === 'error' ? 'alert-error' : 'alert-info'}`}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
