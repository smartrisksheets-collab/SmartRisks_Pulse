import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiPost } from '../services/api';

const IDLE_MS        = 15 * 60 * 1000;
const WARN_MS        = 60 * 1000;
const THROTTLE_MS    = 5_000;
const REFRESH_GAP_MS = 10 * 60 * 1000;

const EVENTS = ['click', 'keydown', 'mousemove', 'touchstart'] as const;

export function useInactivityLogout(onLogout: () => void): {
  countdown: number | null;
  stayLoggedIn: () => void;
} {
  const [countdown, setCountdown] = useState<number | null>(null);
  const { setToken } = useAuthStore();

  const warnTimer   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const tickTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivity  = useRef(0); // set to Date.now() inside effect, not during render
  const lastRefresh   = useRef(0); // same reason
  const onLogoutRef   = useRef(onLogout);

  // Keep ref current without writing it during render
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  // Refs to inner functions so stayLoggedIn can call them after mount
  const scheduleRef = useRef<() => void>(() => {});
  const refreshRef  = useRef<() => void>(() => {});

  function clearAll() {
    if (warnTimer.current)   clearTimeout(warnTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (tickTimer.current)   clearInterval(tickTimer.current);
    warnTimer.current = logoutTimer.current = tickTimer.current = null;
  }

  useEffect(() => {
    // Initialize timestamps here, not at ref declaration
    lastActivity.current = Date.now();
    lastRefresh.current  = Date.now();

    function scheduleTimers() {
      clearAll();
      // setCountdown is only called inside timer callbacks, never synchronously
      warnTimer.current = setTimeout(() => {
        setCountdown(60);
        tickTimer.current = setInterval(() => {
          setCountdown((v) => (v !== null && v > 1 ? v - 1 : v));
        }, 1_000);
        logoutTimer.current = setTimeout(() => {
          setCountdown(null);
          onLogoutRef.current();
        }, WARN_MS);
      }, IDLE_MS - WARN_MS);
    }

    async function silentRefresh() {
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_GAP_MS) return;
      lastRefresh.current = now;
      try {
        const res = await apiPost<{ access_token: string }>('/api/v1/auth/refresh');
        if (res?.access_token) setToken(res.access_token);
      } catch { /* silent */ }
    }

    // Expose to stayLoggedIn via refs (set inside effect, not during render)
    scheduleRef.current = scheduleTimers;
    refreshRef.current  = silentRefresh;

    function handleActivity() {
      const now = Date.now();
      if (now - lastActivity.current < THROTTLE_MS) return;
      lastActivity.current = now;
      scheduleTimers();
      silentRefresh();
    }

    EVENTS.forEach((e) => document.addEventListener(e, handleActivity, { passive: true }));
    scheduleTimers(); // no setState in synchronous path — only schedules setTimeout

    return () => {
      EVENTS.forEach((e) => document.removeEventListener(e, handleActivity));
      clearAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called from a click handler — setState here is fine
  function stayLoggedIn() {
    lastActivity.current = 0;
    setCountdown(null);
    scheduleRef.current();
    refreshRef.current();
  }

  return { countdown, stayLoggedIn };
}