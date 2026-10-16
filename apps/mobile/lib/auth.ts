import { createContext, useContext } from 'react';

export interface OrgContext {
  userId: string;
  orgId: string;
  businessId: string;
  orgName: string;
  role: string;
  org?: {
    name: string;
    address?: string;
    city?: string;
    post_code?: string;
    tax_number?: string;
    iban?: string;
  };
}

export const AuthContext = createContext<OrgContext | null>(null);

/**
 * Izbira podjetja (16.10.2026) - glej lib/podjetja.ts.
 * `clanstva` so samo tista, med katerimi se v blagajni izbira.
 */
export interface PodjetjaKontekst {
  clanstva: import('./podjetja').Clanstvo[];
  izberi: (orgId: string) => Promise<void>;
  zamenjaj: () => void;
}

export const PodjetjaContext = createContext<PodjetjaKontekst>({
  clanstva: [],
  izberi: async () => {},
  zamenjaj: () => {},
});

export function usePodjetja(): PodjetjaKontekst {
  return useContext(PodjetjaContext);
}

export function useAuth(): OrgContext {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('No auth context');
  return ctx;
}
