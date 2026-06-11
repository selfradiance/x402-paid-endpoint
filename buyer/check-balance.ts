import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { readFileSync } from "node:fs";

const wallet = JSON.parse(readFileSync("buyer/.wallet.json", "utf8"));
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const client = createPublicClient({ chain: baseSepolia, transport: http() });

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
console.log("USDC balance on base-sepolia: " + formatUnits(balance, 6));
