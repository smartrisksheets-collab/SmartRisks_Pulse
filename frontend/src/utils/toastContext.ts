import { createContext } from 'react';

export type ToastType = 'success' | 'error' | 'info';
export type ToastFn = (msg: string, type?: ToastType) => void;
export const ToastContext = createContext<ToastFn>(() => {});