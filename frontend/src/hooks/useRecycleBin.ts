// src/hooks/useRecycleBin.ts

import { useState, useCallback } from 'react';
import type { RecycleBinItem } from '../types/risk';
import * as risksApi from '../services/risks';

export function useRecycleBin() {
  const [items, setItems]     = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetch = useCallback(async (itemType?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await risksApi.listBin(itemType);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bin');
    } finally {
      setLoading(false);
    }
  }, []);

  const restore = useCallback(async (binId: string): Promise<boolean> => {
    setLoading(true);
    try {
      await risksApi.restoreItem(binId);
      setItems(prev => prev.filter(i => i.bin_id !== binId));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const purge = useCallback(async (binId: string): Promise<boolean> => {
    setLoading(true);
    try {
      await risksApi.permanentDelete(binId);
      setItems(prev => prev.filter(i => i.bin_id !== binId));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { items, loading, error, fetch, restore, purge };
}