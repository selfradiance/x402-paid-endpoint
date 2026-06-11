import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

const WALLET_PATH = "buyer/.wallet.json";

if (existsSync(WALLET_PATH)) {
  console.error("Wallet already exists at " + WALLET_PATH + ". Refusing to overwrite.");
  process.exit(1);
}

mkdirSync("buyer", { recursive: true });

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

writeFileSync(
  WALLET_PATH,
  JSON.stringify({ address: account.address, privateKey }, null, 2),
  { mode: 0o600 }
);

console.log("Throwaway buyer wallet created.");
console.log("Address: " + account.address);
console.log("Key saved to " + WALLET_PATH + " (gitignored, mode 600)");
