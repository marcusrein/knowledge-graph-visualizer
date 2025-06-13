import { defineChain } from "viem";
import * as chains from "viem/chains";

// Custom chain definition for Geo Genesis testnet (chain ID 19411)
export const geoGenesis = defineChain({
  id: 19411,
  name: "Geo Genesis Testnet",
  network: "geo-genesis",
  nativeCurrency: {
    name: "Geo",
    symbol: "GEO",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_GEOGENESIS_RPC_URL || "https://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz"],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_GEOGENESIS_RPC_URL || "https://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz"],
    },
    webSocket: {
      http: ["wss://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Geo Explorer",
      url: "https://explorer.geo.genesis/",
    },
  },
  testnet: true,
});

export type ScaffoldConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

export const DEFAULT_ALCHEMY_API_KEY = "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

const scaffoldConfig = {
  // The networks on which your DApp is live
  targetNetworks: [chains.hardhat, chains.sepolia],

  // The interval at which your front-end polls the RPC servers for new data
  // it has no effect if you only target the local network (default is 4000)
  pollingInterval: 30000,

  // This is ours Alchemy's default API key.
  // You can get your own at https://dashboard.alchemyapi.io
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,

  // If you want to use a different RPC for a specific network, you can add it here.
  // The key is the chain ID, and the value is the HTTP RPC URL
  rpcOverrides: {
    // Example:
    // [chains.mainnet.id]: "https://mainnet.buidlguidl.com",
  },

  // This is ours WalletConnect's default project ID.
  // You can get your own at https://cloud.walletconnect.com
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",

  // Only show the Burner Wallet when running on hardhat network
  onlyLocalBurnerWallet: true,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
