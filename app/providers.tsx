'use client';
import { ClientProvider } from '@solana/react';
import { client } from '@/lib/solana/client';
export function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
