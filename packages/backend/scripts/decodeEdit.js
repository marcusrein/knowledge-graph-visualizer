#!/usr/bin/env node

// Usage: node decodeEdit.js <CID>
const { Ipfs } = require("@graphprotocol/grc-20");

async function main() {
  const cid = process.argv[2];
  if (!cid) {
    console.error("Usage: node decodeEdit.js <CID>");
    process.exit(1);
  }
  try {
    const decoded = await Ipfs.decodeEdit(cid);
    console.log(JSON.stringify(decoded, null, 2));
  } catch (e) {
    console.error("Failed to decode edit:", e.message || e);
    process.exit(1);
  }
}

main(); 