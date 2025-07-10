"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { metaMask } from '@wagmi/connectors';
import { Toaster } from 'react-hot-toast';
import { TerminologyProvider } from '@/lib/TerminologyContext';

const queryClient = new QueryClient();

const config = createConfig({
  chains: [mainnet],
  connectors: [
    metaMask(),
  ],
  transports: {
    [mainnet.id]: http(),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <TerminologyProvider>
          <Toaster />
          {children}
        </TerminologyProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
} 