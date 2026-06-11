import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";

const wallet = JSON.parse(readFileSync("buyer/.wallet.json", "utf8"));
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const client = createPublicClient({ chain: base, transport: http() });

const balance = await client.readContract({
  address: USDC,
  abi: [{
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  }],
  functionName: "balanceOf",
  args: [wallet.address],
});

console.log("Address: " + wallet.address);
console.log("USDC balance on base: " + formatUnits(balance, 6));
