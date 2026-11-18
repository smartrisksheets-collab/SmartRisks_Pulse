// src/hooks/useConfirm.ts
// Promise-based confirm for pages that render <ConfirmModal {...confirmProps} />.

import { useCallback, useState } from 'react';

export interface ConfirmRequest {
  title:   string;
  message: string;
  okText?: string;
}

interface ConfirmState extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const ask = useCallback((req: ConfirmRequest): Promise<boolean> =>
    new Promise<boolean>((resolve) => setState({ ...req, resolve })), []);

  const close = useCallback((ok: boolean) => {
    setState((s) => { s?.resolve(ok); return null; });
  }, []);

  return { ask, confirmProps: { request: state, onClose: close } };
}
