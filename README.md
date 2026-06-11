# x402 Paid Endpoint

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Minimal Cloudflare Worker seller endpoint for one x402-gated JSON artifact on Base Sepolia.

Live Worker:

```text
https://x402-paid-endpoint.selfradiance.workers.dev
```

## Routes

### `GET /`

Free discovery route. Returns endpoint metadata:

- artifact path
- price
- network
- payTo address
- x402 v2 header names
- facilitator URL

### `GET /artifact/vq00.json`

Paid route. Without payment, the Worker returns `402 Payment Required` with:

- `PAYMENT-REQUIRED` header containing x402 v2 payment requirements
- JSON body with the same human-readable payment basics

After a valid x402 v2 payment is supplied in the `PAYMENT-SIGNATURE` header, the Worker verifies and settles through the CDP facilitator, then returns the embedded JSON artifact.

## Payment Terms

```json
{
  "scheme": "exact",
  "price": "$1.00",
  "currency": "USDC",
  "network": "base-sepolia",
  "networkCaip2": "eip155:84532",
  "payTo": "0x155463b78af48b2db07583c266b18e35bee4eed7",
  "facilitator": "https://api.cdp.coinbase.com/platform/v2/x402"
}
```

The Worker currently serves the artifact embedded from:

```text
https://selfradiance.github.io/specs/vq00-zion-skank.json
```

It does not proxy GitHub Pages at request time.

## Machine Payment Flow

1. Request `GET /artifact/vq00.json`.
2. Receive `402 Payment Required`.
3. Decode the `PAYMENT-REQUIRED` response header.
4. Create and sign an x402 v2 payment payload for the returned requirements.
5. Retry the same request with `PAYMENT-SIGNATURE: <encoded-payment-payload>`.
6. On valid payment, receive the JSON artifact and a `PAYMENT-RESPONSE` settlement header.

Buyer client code is intentionally out of scope for Phase 1.

## Local Development

Install dependencies:

```sh
npm install
```

Run tests:

```sh
npm test
```

Run a deploy dry run:

```sh
npm run build
```

Run locally:

```sh
npm run dev
```

## Deploy

Secrets must only enter Cloudflare through Wrangler:

```sh
npx wrangler secret put CDP_API_KEY_ID
npx wrangler secret put CDP_API_KEY_SECRET
```

Never commit CDP credentials. `.dev.vars` is ignored preemptively.

Deploy:

```sh
npm run deploy
```

## Boundaries

- Phase 1 seller side only.
- Serves one embedded JSON artifact.
- Testnet only: Base Sepolia (`eip155:84532`).
- x402 protocol v2 only.
- No buyer client in this repo.
- No custody. Payments go to the configured `payTo` address.
- Verification and settlement are delegated to the CDP x402 facilitator.
- No Durable Objects, KV, queues, or other paid Cloudflare storage/services.

## License

MIT. See [LICENSE](./LICENSE).
