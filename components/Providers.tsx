'use client';

import { TerminologyProvider } from '@/lib/TerminologyContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '@/lib/wallet';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <TerminologyProvider>{children}</TerminologyProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
} 