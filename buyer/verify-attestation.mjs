import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";

const file = process.argv[2];
const body = JSON.parse(readFileSync(file, "utf8"));

const keyUrl = "https://web-attestation.selfradiance.workers.dev/.well-known/web-attestation-key.json";
const keyDoc = await (await fetch(keyUrl)).json();
console.log("Published key doc:", JSON.stringify(keyDoc));

const rawKey = Buffer.from(keyDoc.x, "base64url");
const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]);
const publicKey = createPublicKey({ key: spki, format: "der", type: "spki" });

function canonicalStringify(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalStringify).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonicalStringify(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

const message = Buffer.from(canonicalStringify(body.payload), "utf8");
const sig = Buffer.from(body.signature, "base64url");
const ok = verify(null, message, publicKey, sig);
console.log("Signature valid against PUBLISHED key:", ok);
console.log("kid match:", body.kid === keyDoc.kid);
