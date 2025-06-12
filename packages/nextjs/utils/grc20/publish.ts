import { Ipfs, type Op } from "@graphprotocol/grc-20";
import { WalletClient } from "viem";

/**
 * Publish a set of Ops: IPFS ➜ fetch calldata ➜ send tx.
 * Returns the CID and on-chain tx hash.
 */
export async function publish({
  spaceId,
  ops,
  author,
  editName,
  walletClient,
  network = "TESTNET",
}: {
  spaceId: string;
  ops: Op[];
  author: string;
  editName: string;
  walletClient: WalletClient;
  network?: "TESTNET" | "MAINNET";
}): Promise<{ cid: string; txHash: string }> {
  // 1. Upload edit to IPFS via SDK (returns ipfs://CID)
  const { cid } = await Ipfs.publishEdit({ name: editName, ops, author });
  const cidWithPrefix: string = (cid as any).toString?.() ?? String(cid);

  // 2. Obtain calldata for this space
  const metaRes = await fetch(
    `https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: cidWithPrefix, network }),
    },
  );

  if (!metaRes.ok) {
    const body = await metaRes.text();
    throw new Error(`calldata fetch failed: ${metaRes.status} – ${body}`);
  }

  const json: any = await metaRes.json();
  const to: string = json.to as string;
  const data: string = json.data as string;

  // 3. Send tx
  const txHash = await (walletClient as any).sendTransaction({ to: to as any, data: data as any });

  return { cid: cidWithPrefix.replace(/^ipfs:\/\//, ""), txHash: txHash as string };
} 