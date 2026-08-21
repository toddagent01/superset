import { describe, expect, test } from "bun:test";
import { verifyStandardWebhook } from "./verify";

/**
 * The vector published with the Standard Webhooks spec. Pinning it is the
 * point of this file: both ways of getting the scheme wrong are silent. A
 * signature we compute differently than the sender means the trigger never
 * fires and nothing says why; a comparison that passes when it should not is
 * an authentication bypass on a public endpoint.
 */
const VECTOR = {
	secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
	id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
	timestamp: "1614265330",
	body: '{"test": 2432232314}',
	signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

/**
 * The vector's timestamp is from 2021, so freshness has to be taken out of the
 * way to test the signature itself. Staleness gets its own case below.
 */
const IGNORE_AGE = 1e15;

function verify(
	overrides: Partial<Parameters<typeof verifyStandardWebhook>[0]>,
) {
	return verifyStandardWebhook({
		id: VECTOR.id,
		timestamp: VECTOR.timestamp,
		signatureHeader: VECTOR.signature,
		body: VECTOR.body,
		secret: VECTOR.secret,
		toleranceMs: IGNORE_AGE,
		...overrides,
	});
}

describe("verifyStandardWebhook", () => {
	test("accepts the published spec vector", () => {
		expect(verify({})).toBe(true);
	});

	test("accepts when a rotation puts the match second", () => {
		expect(verify({ signatureHeader: `v1,AAAA ${VECTOR.signature}` })).toBe(
			true,
		);
	});

	// Each of these is a distinct forgery: the signature covers the id and the
	// timestamp as well as the body, so changing any one has to invalidate it.
	test("rejects a tampered body", () => {
		expect(verify({ body: '{"test": 1}' })).toBe(false);
	});

	test("rejects a tampered id", () => {
		expect(verify({ id: "msg_somethingelse" })).toBe(false);
	});

	test("rejects a replayed body under a new timestamp", () => {
		expect(verify({ timestamp: "1614265331" })).toBe(false);
	});

	test("rejects a different secret", () => {
		expect(verify({ secret: "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).toBe(
			false,
		);
	});

	test("rejects a version this code does not implement", () => {
		expect(
			verify({ signatureHeader: VECTOR.signature.replace("v1,", "v2,") }),
		).toBe(false);
	});

	test("rejects a missing header rather than throwing", () => {
		expect(verify({ signatureHeader: null })).toBe(false);
		expect(verify({ id: null })).toBe(false);
		expect(verify({ timestamp: null })).toBe(false);
	});

	test("rejects a stale delivery even though the signature is good", () => {
		expect(verify({ toleranceMs: 5 * 60 * 1000 })).toBe(false);
	});

	test("rejects a malformed header rather than throwing", () => {
		expect(verify({ signatureHeader: "garbage" })).toBe(false);
		expect(verify({ signatureHeader: "v1," })).toBe(false);
	});
});
