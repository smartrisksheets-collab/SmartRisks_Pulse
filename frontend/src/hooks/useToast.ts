import { useContext } from 'react';
import { ToastContext } from '../utils/toastContext';

export function useToast() {
  return useContext(ToastContext);
}