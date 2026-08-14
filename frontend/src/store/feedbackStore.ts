import { create } from 'zustand';

interface FeedbackState {
  event: string | null;
  label: string | null;
  trigger: (event: string, label: string) => void;
  clear: () => void;
}

export const useFeedbackStore = create<FeedbackState>()((set) => ({
  event:   null,
  label:   null,
  trigger: (event, label) => set({ event, label }),
  clear:   () => set({ event: null, label: null }),
}));