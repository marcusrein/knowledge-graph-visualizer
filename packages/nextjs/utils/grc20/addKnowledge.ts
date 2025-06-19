import { Graph } from "@graphprotocol/grc-20";
import toast from "react-hot-toast";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

export interface AddKnowledgeParams {
  nodeId: string;
  knowledgeValue: string;
  userAddress: string;
  walletClient: any;
  spaceId: string;
}

/**
 * Adds a new knowledge value to an existing entity.
 * Throws on error so the caller can surface feedback.
 */
export const addKnowledge = async ({
  nodeId,
  knowledgeValue,
  userAddress,
  walletClient,
  spaceId,
}: AddKnowledgeParams) => {
  // 1. Build ops for new entity and relation
  const { id: newEntityId, ops } = Graph.createEntity({
    description: knowledgeValue,
    name: knowledgeValue.slice(0, 32),
  });

  // 2. Upload via backend so the edit is pinned to IPFS and recorded in DB
  const payload = {
    userAddress,
    edits: ops,
    entityId: newEntityId,
    description: knowledgeValue,
    name: knowledgeValue.slice(0, 32),
    spaceId,
    relatedTo: nodeId,
  };

  console.log("[CLIENT] Upload payload", payload);

  const uploadRes = await fetch("http://localhost:4000/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload API error: ${uploadRes.status} – ${text}`);
  }
  const { cid: cidWithPrefix } = await uploadRes.json();

  // 3. Get calldata from GRC-20 service and relay on-chain
  const metaRes = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
    method: "POST",
    body: JSON.stringify({ cid: cidWithPrefix, network: "TESTNET" }),
    headers: { "Content-Type": "application/json" },
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(`GRC-20 API error: ${metaRes.status} – ${text}`);
  }
  const { to, data } = await metaRes.json();

  const hash = await walletClient.sendTransaction({ to, data: data as `0x${string}` });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
  if (receipt.status === "reverted") {
    throw new Error("Transaction reverted");
  }

  toast.success("Knowledge submitted on-chain! Refreshing…");
}; 