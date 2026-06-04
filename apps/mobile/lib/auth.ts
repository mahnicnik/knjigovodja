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

export function useAuth(): OrgContext {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('No auth context');
  return ctx;
}
