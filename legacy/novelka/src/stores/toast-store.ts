import { create } from 'zustand';

type ToastKind = 'idle' | 'busy' | 'error' | 'success';

interface ToastState {
  status: { kind: ToastKind; message: string };
  setStatus: (kind: ToastKind, message: string) => void;
  clearStatus: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  status: { kind: 'idle', message: '' },

  setStatus: (kind, message) => {
    set({ status: { kind, message } });

    if (kind !== 'busy') {
      setTimeout(() => {
        if (get().status.message === message) {
          set({ status: { kind: 'idle', message: '' } });
        }
      }, 3200);
    }
  },

  clearStatus: () => set({ status: { kind: 'idle', message: '' } }),
}));
