import { Graph } from "@graphprotocol/grc-20";
import toast from "react-hot-toast";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

export interface CreateEntityParams {
  name: string;
  description: string;
  userAddress: string;
  walletClient: any;
  spaceId: string;
}

export const createEntityOnChain = async ({ name, description, userAddress, walletClient, spaceId }: CreateEntityParams) => {
  // 1. Build ops
  const { id: entityId, ops } = Graph.createEntity({ name, description });

  // 2. Upload to backend
  const uploadRes = await fetch("http://localhost:4000/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userAddress,
      edits: ops,
      entityId,
      name,
      description,
      spaceId,
    }),
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload API error ${uploadRes.status}: ${text}`);
  }
  const { cid } = await uploadRes.json();

  await new Promise(res => setTimeout(res, 2000));

  // 3. Publish on-chain
  const metaRes = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
    method: "POST",
    body: JSON.stringify({ cid, network: "TESTNET" }),
    headers: { "Content-Type": "application/json" },
  });
  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(`GRC-20 API error ${metaRes.status}: ${text}`);
  }
  const { to, data } = await metaRes.json();

  const hash = await walletClient.sendTransaction({ to, data: data as `0x${string}` });
  await waitForTransactionReceipt(wagmiConfig, { hash });

  toast.success("New knowledge category published! Refreshing…");
}; 