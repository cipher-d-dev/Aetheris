import {create} from 'zustand';
import {NodeIdentity, initIdentity} from '../crypto/identity';

interface IdentityState {
  identity: NodeIdentity | null;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
}

export const useIdentityStore = create<IdentityState>(set => ({
  identity: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({isLoading: true, error: null});
    try {
      const identity = await initIdentity();
      set({identity, isLoading: false});
    } catch (e: any) {
      set({error: e.message, isLoading: false});
    }
  },
}));
