import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  createApp,
  createPaymentMiddlewareWithFacilitator,
  type Env,
} from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const payTo = "0x155463b78af48b2db07583c266b18e35bee4eed7";
const env: Env = {
  CDP_API_KEY_ID: "test-only-unused",
  CDP_API_KEY_SECRET: "test-only-unused",
};

const testFacilitator = {
  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
      extensions: [],
      signers: {},
    };
  },
  async verify(_payload: PaymentPayload, _requirements: PaymentRequirements) {
    return { isValid: false, invalidReason: "test-facilitator-no-payment" };
  },
  async settle(_payload: PaymentPayload, requirements: PaymentRequirements) {
    return {
      success: false,
      errorReason: "test-facilitator-no-settlement",
      transaction: "",
      network: requirements.network,
    };
  },
} satisfies FacilitatorClient;

function createTestApp() {
  return createApp(() =>
    createPaymentMiddlewareWithFacilitator(testFacilitator),
  );
}

describe("x402 paid endpoint", () => {
  it("returns discovery JSON from the free route", async () => {
    const app = createTestApp();
    const ctx = createExecutionContext();
    const response = await app.fetch(new IncomingRequest("https://unit.test/"), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      artifact: "/artifact/vq00.json",
      price: "$1.00",
      network: "base-sepolia",
      networkCaip2: "eip155:84532",
      payTo,
      x402: {
        version: 2,
        requestHeader: "PAYMENT-SIGNATURE",
        requirementsHeader: "PAYMENT-REQUIRED",
      },
    });
  });

  it("returns x402 v2 payment requirements for an unpaid artifact request", async () => {
    const app = createTestApp();
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new IncomingRequest("https://unit.test/artifact/vq00.json", {
        headers: { accept: "application/json" },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(402);

    const body = await response.json<{
      x402Version: number;
      accepts: Array<{
        scheme: string;
        price: string;
        network: string;
        networkName: string;
        payTo: string;
      }>;
    }>();
    expect(body).toMatchObject({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          price: "$1.00",
          network: "eip155:84532",
          networkName: "base-sepolia",
          payTo,
        },
      ],
    });

    const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
    expect(paymentRequiredHeader).toBeTruthy();

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader!);
    expect(paymentRequired.x402Version).toBe(2);
    expect(paymentRequired.resource).toMatchObject({
      url: "https://unit.test/artifact/vq00.json",
      mimeType: "application/json",
    });
    expect(paymentRequired.accepts).toHaveLength(1);
    expect(paymentRequired.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "eip155:84532",
      amount: "1000000",
      payTo,
    });
  });
});
