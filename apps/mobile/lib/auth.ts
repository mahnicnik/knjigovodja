import { createContext, useContext } from 'react';

export interface OrgContext {
  userId: string;
  orgId: string;
  orgName: string;
  role: string;
}

export const AuthContext = createContext<OrgContext | null>(null);

export function useAuth(): OrgContext {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('No auth context');
  return ctx;
}
