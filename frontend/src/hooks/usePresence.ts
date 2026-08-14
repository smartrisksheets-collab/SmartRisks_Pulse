import { useEffect, useState } from 'react';
import { apiPost, apiGet } from '../services/api';

export function usePresence(tenantId: string): string[] {
  const [emails, setEmails] = useState<string[]>([]);

  useEffect(() => {
    if (!tenantId) return; // no setState here — Topbar guards render with tenantId check

    let active = true;

    async function beat() {
      try { await apiPost('/api/v1/presence/heartbeat'); } catch { /* silent */ }
    }

    async function poll() {
      try {
        const data = await apiGet<string[]>('/api/v1/presence/active');
        if (active) setEmails(data); // inside async callback — not synchronous setState
      } catch { /* silent */ }
    }

    beat();
    poll();

    const beatId = setInterval(beat, 90_000);
    const pollId = setInterval(poll, 60_000);

    return () => {
      active = false;
      clearInterval(beatId);
      clearInterval(pollId);
    };
  }, [tenantId]);

  return emails;
}