import { useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext, type ToastFn, type ToastType } from '../../utils/toastContext';

interface ToastItem {
  id: string;
  msg: string;
  type: ToastType;
  show: boolean;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastFn>((msg, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, msg, type, show: false }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, show: true } : t)));
    }, 16);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, show: false } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 220);
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div id="toastHost">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={['toast', t.show ? 'show' : '', t.type !== 'info' ? t.type : '']
                .filter(Boolean)
                .join(' ')}
            >
              {t.msg}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

