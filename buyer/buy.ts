import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  evaluateAndRecord,
  keyIdFromPublicKey,
  SqliteReceiptLedger,
  verifyChain,
} from "x402-spend-receipt";
import type { Ed25519KeyPair, Intent, Policy } from "x402-spend-receipt";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GATED_URL = "https://x402-paid-endpoint.selfradiance.workers.dev/artifact/vq00.json";
const SPEND_RECEIPT_CONFIG_ROOT = "buyer/.spend-receipt";
const SPEND_RECEIPT_CONFIG_DIR = join(SPEND_RECEIPT_CONFIG_ROOT, "x402-spend-receipt");

type BuyerWallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readSpendReceiptKeyPair(): Ed25519KeyPair {
  const publicKey = readFileSync(join(SPEND_RECEIPT_CONFIG_DIR, "ed25519.public.key"), "utf8").trim();
  const privateKey = readFileSync(join(SPEND_RECEIPT_CONFIG_DIR, "ed25519.private.key"), "utf8").trim();

  return {
    publicKey,
    privateKey,
    keyId: keyIdFromPublicKey(publicKey),
  };
}

function selectRequirement(_x402Version: number, accepts: PaymentRequirements[]): PaymentRequirements {
  const requirement = accepts.find(item => item.scheme === "exact" && item.network === "eip155:84532");
  assert(requirement, "No exact eip155:84532 payment requirement found in PAYMENT-REQUIRED header.");
  return requirement;
}

function buildIntent(paymentRequired: PaymentRequired, requirement: PaymentRequirements): Intent {
  const endpointUrl = paymentRequired.resource?.url;
  assert(typeof endpointUrl === "string" && endpointUrl.length > 0, "PAYMENT-REQUIRED resource.url is missing.");

  const asset = typeof requirement.extra?.name === "string" ? requirement.extra.name : requirement.asset;

  return {
    method: "x402",
    endpoint_url: endpointUrl,
    pay_to: requirement.payTo,
    asset,
    network: requirement.network,
    amount_base_units: requirement.amount,
    agent_urn: "urn:agent:" + new URL(endpointUrl).host + ":buyer",
  };
}

const wallet = readJsonFile<BuyerWallet>("buyer/.wallet.json");
const account = privateKeyToAccount(wallet.privateKey);
const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const signer = toClientEvmSigner(account, publicClient);

const coreClient = new x402Client(selectRequirement);
registerExactEvmScheme(coreClient, { signer, networks: ["eip155:84532"] });
const httpClient = new x402HTTPClient(coreClient);

const unpaidResponse = await fetch(GATED_URL);
assert(unpaidResponse.status === 402, "Expected initial GET to return 402, got " + unpaidResponse.status + ".");

const paymentRequired = httpClient.getPaymentRequiredResponse(name => unpaidResponse.headers.get(name));
const selectedRequirement = selectRequirement(paymentRequired.x402Version, paymentRequired.accepts);
const intent = buildIntent(paymentRequired, selectedRequirement);

const policy = readJsonFile<Policy>(join(SPEND_RECEIPT_CONFIG_DIR, "policy.json"));
const keyPair = readSpendReceiptKeyPair();
const ledger = new SqliteReceiptLedger(join(SPEND_RECEIPT_CONFIG_DIR, "ledger.sqlite"));

let chainResult: ReturnType<typeof verifyChain> | null = null;

try {
  const policyResult = evaluateAndRecord(intent, policy, { ledger, keyPair });

  console.log("Policy decision: " + policyResult.decision);
  console.log("Policy reason_code: " + policyResult.reasonCode);

  if (policyResult.decision === "DENY") {
    console.log("Spend receipt:");
    console.log(JSON.stringify(policyResult.receipt, null, 2));
    process.exitCode = 1;
  } else {
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
    const paidResponse = await fetch(GATED_URL, { headers: paymentHeaders });

    console.log("Paid retry status: " + paidResponse.status);
    assert(paidResponse.status === 200, "Expected paid retry to return 200, got " + paidResponse.status + ".");

    const artifact = await paidResponse.json() as Record<string, unknown>;
    const paymentResponse = httpClient.getPaymentSettleResponse(name => paidResponse.headers.get(name));

    console.log("Artifact top-level keys: " + Object.keys(artifact).join(", "));
    console.log("Payment response:");
    console.log(JSON.stringify(paymentResponse, null, 2));

    chainResult = verifyChain(ledger, keyPair.publicKey);
    console.log("Chain verification:");
    console.log(JSON.stringify(chainResult, null, 2));
  }
} finally {
  ledger.close();
}
