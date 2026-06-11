import { createFacilitatorConfig } from "@coinbase/x402";
import {
  type FacilitatorClient,
  HTTPFacilitatorClient,
  type RoutesConfig,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono, type MiddlewareHandler } from "hono";

export interface Env {
  CDP_API_KEY_ID: string;
  CDP_API_KEY_SECRET: string;
}

const PAY_TO = "0x155463b78af48b2db07583c266b18e35bee4eed7";
const PRICE = "$1.00";
const PRICE_BASE_UNITS = "1000000";
const NETWORK = "eip155:8453" as const;
const NETWORK_NAME = "base";
const USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_EXTRA = { name: "USD Coin", version: "2" };
const ARTIFACT_PATH = "/artifact/vq00.json";
const ARTIFACT_SOURCE =
  "https://selfradiance.github.io/specs/vq00-zion-skank.json";

const artifact = {
  protocol: "SR-ZionSkank-License-v1",
  type: "CreativeLicense",
  license: {
    grant:
      "Non-exclusive, worldwide, perpetual license to use Zion Skank audio in derivative works, including AI-generated content, video productions, and commercial projects.",
    royalty: "Zero-royalty after one-time $1.00 license purchase.",
    attribution:
      "Required. Credit must include 'Music by Zion Skank / James Toole' with a link to https://www.youtube.com/@ZionSkank where feasible.",
    covered_genres: [
      "Reggae-Rock",
      "Reggae-Metal",
      "Reggae-Jazz",
      "Reggae-Funk",
      "Reggae-Bluegrass",
      "Reggae-Blues",
      "Roots-Reggae",
    ],
    restrictions: [
      "License token is non-transferable between legal entities without separate purchase.",
      "License does not grant ownership of master recordings or composition copyrights.",
      "Resale or sublicensing of the raw audio files as standalone products is prohibited.",
    ],
  },
  verification: {
    method: "On-chain receipt validation via Self-Radiance Notary",
    notary_url: "https://self-radiance-notary.selfradiance.workers.dev",
  },
} as const;

const protectedRoutes = {
  [`GET ${ARTIFACT_PATH}`]: {
    accepts: [
      {
        scheme: "exact",
        price: {
          amount: PRICE_BASE_UNITS,
          asset: USDC_ASSET,
          extra: USDC_EXTRA,
        },
        network: NETWORK,
        payTo: PAY_TO,
      },
    ],
    description: "Zion Skank vq00 creative license specification JSON",
    mimeType: "application/json",
    unpaidResponseBody: () => ({
      contentType: "application/json",
      body: {
        x402Version: 2,
        error: "Payment required",
        accepts: [
          {
            scheme: "exact",
            price: PRICE,
            network: NETWORK,
            networkName: NETWORK_NAME,
            payTo: PAY_TO,
          },
        ],
      },
    }),
  },
} satisfies RoutesConfig;

export function createPaymentMiddlewareWithFacilitator(
  facilitatorClient: FacilitatorClient,
): MiddlewareHandler {
  const server = new x402ResourceServer(facilitatorClient).register(
    NETWORK,
    new ExactEvmScheme(),
  );

  return paymentMiddleware(protectedRoutes, server);
}

function createCdpPaymentMiddleware(env: Env): MiddlewareHandler {
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) {
    return async (c) =>
      c.json({ error: "CDP facilitator secrets are not configured." }, 500);
  }

  const facilitatorClient = new HTTPFacilitatorClient(
    createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET),
  );
  return createPaymentMiddlewareWithFacilitator(facilitatorClient);
}

export function createApp(
  createPaymentMiddleware = createCdpPaymentMiddleware,
) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", (c) =>
    c.json({
      name: "x402-paid-endpoint",
      artifact: ARTIFACT_PATH,
      artifactSource: ARTIFACT_SOURCE,
      price: PRICE,
      currency: "USDC",
      network: NETWORK_NAME,
      networkCaip2: NETWORK,
      payTo: PAY_TO,
      x402: {
        version: 2,
        requestHeader: "PAYMENT-SIGNATURE",
        requirementsHeader: "PAYMENT-REQUIRED",
        facilitator: "https://api.cdp.coinbase.com/platform/v2/x402",
      },
    }),
  );

  app.use(ARTIFACT_PATH, async (c, next) =>
    createPaymentMiddleware(c.env)(c, next),
  );

  app.get(ARTIFACT_PATH, (c) => c.json(artifact));

  return app;
}

export default createApp();
