import { z } from "zod";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

export const EVENT_TYPE = "note.generated";

/**
 * A Granola delivery, which is a pointer and not a document: `note_id`, what
 * happened, and when. The note itself — title, summary, action items,
 * transcript — is never in the payload, so the prompt gets the id and the
 * agent reads the note through the Granola MCP plugin.
 *
 * `passthrough` so anything Granola adds later reaches the prompt without a
 * schema change here.
 */
export const noteEventSchema = z
	.object({
		event_id: z.string().min(1),
		event_type: z.string().min(1),
		note_id: z.string().min(1),
		occurred_at: z.string().optional(),
	})
	.passthrough();

export type GranolaNoteEvent = z.infer<typeof noteEventSchema>;

/**
 * Like Circleback, a Granola delivery is addressed: the URL names the trigger,
 * so only that trigger is a candidate and the dedupe key carries its id. Two
 * triggers watching the same Granola workspace each register their own
 * endpoint and each get their own delivery of the same note.
 *
 * `event_id` rather than `note_id` is the external id: Granola sends one event
 * per occurrence, and a note that is edited later is a new event about the
 * same note. Keying on the note would swallow the second one.
 */
export function normalizeGranolaDelivery(params: {
	organizationId: string;
	automationId: string;
	triggerId: string;
	note: GranolaNoteEvent;
	payload: unknown;
}): NormalizedDelivery {
	const { note, triggerId } = params;
	return {
		event: {
			organizationId: params.organizationId,
			integrationConnectionId: null,
			provider: "granola",
			eventType: EVENT_TYPE,
			externalEventId: `${triggerId}:${note.event_id}`,
			resourceKey: `granola:${note.note_id}`,
			// A delivery carries no title, so the id is the only honest label.
			title: `Granola note ${note.note_id}`,
			url: `https://notes.granola.ai/d/${note.note_id}`,
			payload: params.payload,
		},
		dispatch: {
			automationId: params.automationId,
			triggerId,
			event: {
				provider: "granola",
				eventType: EVENT_TYPE,
				actorId: null,
				actorLogin: null,
				body: null,
				noteId: note.note_id,
			},
		},
	};
}
