import { createConfig, http } from 'wagmi';
import { metaMask } from 'wagmi/connectors';
import { mainnet, sepolia } from 'wagmi/chains';

const chains = [mainnet, sepolia];

export const wagmiConfig = createConfig({
  connectors: [metaMask({ chains })],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
}); 