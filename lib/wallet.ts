import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'Knowledge Graph Demo',
  projectId: 'wagmi-demo', // dummy projectId for demo; replace in prod
  chains: [sepolia, mainnet],
}); 