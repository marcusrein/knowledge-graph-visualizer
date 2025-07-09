"use client";

import { ReactNode } from 'react';
import { WagmiConfig } from 'wagmi';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wallet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider
        modalSize="compact"
        coolMode
        theme={{
          lightMode: lightTheme(),
          darkMode: darkTheme(),
        }}
      >
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </RainbowKitProvider>
    </WagmiConfig>
  );
} 