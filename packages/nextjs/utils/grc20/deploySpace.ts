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
      const res: { id: string } = await (Graph as any).createSpace({
        name: spaceName,
        editorAddress: initialEditorAddress,
        network,
      } as any);
      return res.id;
    } catch (err: any) {
      lastErr = err;
      if (err?.response) {
        try {
          const text = await err.response.text?.();
          console.error("GRC-20 createSpace API error:", err.response.status, text);
        } catch {
          console.error("GRC-20 createSpace API error (no text):", err);
        }
      } else {
        console.error("GRC-20 createSpace error:", err);
      }
      // brief delay before retrying
      await new Promise(res => setTimeout(res, 1500));
    }
  }
  throw lastErr;
} 