import { Graph } from "@graphprotocol/grc-20";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [spaceName, editorAddress] = process.argv.slice(2);

  if (!spaceName || !editorAddress) {
    console.log("Usage: yarn create-space <spaceName> <editorAddress>");
    process.exit(1);
  }

  console.log(`Creating PERSONAL space '${spaceName}' for ${editorAddress} on Geo Genesis testnet...`);

  try {
    const spaceId = await Graph.createSpace({
      spaceName,
      initialEditorAddress: editorAddress,
      network: "TESTNET", // Geo Genesis
    });

    console.log("✅ Created space:", spaceId);
  } catch (error: any) {
    console.error("❌ Space creation failed", error);
    process.exit(1);
  }
}

main();
