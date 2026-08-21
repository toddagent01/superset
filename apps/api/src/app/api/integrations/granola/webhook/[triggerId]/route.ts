import { dbWs } from "@superset/db/client";
import { automations, automationTriggers } from "@superset/db/schema";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { cappedBody, parseJson } from "@/lib/webhooks/body";
import { verifyStandardWebhook } from "@/lib/webhooks/verify";
import {
	EVENT_TYPE,
	normalizeGranolaDelivery,
	noteEventSchema,
} from "./normalizeGranolaDelivery";

export const dynamic = "force-dynamic";

/**
 * Granola disables an endpoint after four days of failures and does not replay
 * what it missed, so a rejection here is expensive in a way GitHub's is not.
 */
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(300, "1 m"),
	prefix: "ratelimit:integrations:granola:webhook",
});

/**
 * One Granola note event, delivered to the trigger named in the URL.
 *
 * Addressed like Circleback rather than fanned out like GitHub: the user
 * registered this URL in Granola's Settings → Connectors → Webhooks, so this
 * trigger is the only candidate.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
	const { triggerId } = await params;
	if (!z.string().uuid().safeParse(triggerId).success) {
		return Response.json({ error: "Unknown trigger" }, { status: 404 });
	}

	const { success: withinLimit } = await rateLimit.limit(triggerId);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const [trigger] = await dbWs
		.select({
			organizationId: automationTriggers.organizationId,
			automationId: automationTriggers.automationId,
			// For an HMAC provider the column holds the signing key itself — a
			// hash could not verify a signature.
			secret: automationTriggers.secretHash,
			automationEnabled: automations.enabled,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.id, triggerId),
				eq(automationTriggers.kind, "granola"),
			),
		)
		.limit(1);

	if (!trigger) {
		return Response.json({ error: "Unknown trigger" }, { status: 404 });
	}

	const body = await cappedBody(request);
	if (body instanceof Response) return body;

	// A trigger with no secret yet cannot tell Granola from anyone who has seen
	// the URL, so it accepts nothing until one is pasted in.
	const secret = trigger.secret;
	if (!secret) {
		console.warn(
			"[granola/webhook] No signing secret configured for trigger:",
			triggerId,
		);
		return Response.json(
			{ error: "Signing secret not configured" },
			{ status: 401 },
		);
	}

	const verified = verifyStandardWebhook({
		id: request.headers.get("webhook-id"),
		timestamp: request.headers.get("webhook-timestamp"),
		signatureHeader: request.headers.get("webhook-signature"),
		body,
		secret,
		toleranceMs: SIGNATURE_TOLERANCE_MS,
	});
	if (!verified) {
		console.warn("[granola/webhook] Invalid signature for trigger:", triggerId);
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Refused before the event row exists: the dedupe key is permanent, so a
	// delivery recorded during a pause would swallow the redelivery too.
	if (!trigger.automationEnabled) {
		return Response.json({ error: "Automation is disabled" }, { status: 400 });
	}

	const json = parseJson<unknown>(body);
	if (json instanceof Response) return json;
	const parsed = noteEventSchema.safeParse(json);
	if (!parsed.success) {
		console.error("[granola/webhook] Unexpected payload shape", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	// One endpoint can be subscribed to several events; the trigger only speaks
	// for one. Acknowledged rather than refused — a 4xx counts against the
	// endpoint's health on Granola's side and eventually disables it.
	if (parsed.data.event_type !== EVENT_TYPE) {
		return Response.json({ ok: true, outcome: "ignored" });
	}

	const outcome = await ingestAutomationEvent(
		dbWs,
		normalizeGranolaDelivery({
			organizationId: trigger.organizationId,
			automationId: trigger.automationId,
			triggerId,
			note: parsed.data,
			payload: json,
		}),
	);
	return Response.json({ ok: true, outcome });
}
