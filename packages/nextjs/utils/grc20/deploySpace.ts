import { Graph } from "@graphprotocol/grc-20";

/**
 * Deploy a PERSONAL space on Geo Genesis (TESTNET) or Mainnet.
 * Mirrors the logic used in the official hackathon template.
 */
export async function deploySpace({
  spaceName,
  initialEditorAddress,
  network = "TESTNET",
}: {
  spaceName: string;
  initialEditorAddress: string;
  network?: "TESTNET" | "MAINNET";
}): Promise<string> {
  // Wrap in a small retry in case the API node momentarily fails.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const spaceId: string = await (Graph as any).createSpace({
        spaceName,
        initialEditorAddress,
        network,
      } as any);
      return spaceId;
    } catch (err) {
      lastErr = err;
      // brief delay before retrying
      await new Promise(res => setTimeout(res, 1500));
    }
  }
  throw lastErr;
} 