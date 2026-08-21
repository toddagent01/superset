import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type GranolaConfig = Extract<TriggerConfigInput, { kind: "granola" }>;

/**
 * The one sentence a Granola trigger reads as.
 *
 * Shorter than Circleback's, and deliberately: a Granola delivery carries only
 * a note id, so there is nothing to narrow on here. Which notes arrive is
 * decided on Granola's side when the endpoint is registered — its scopes, and
 * an optional folder filter — so the sentence is the event plus the two chips
 * their side needs.
 */
export type Slot = "endpoint" | "signingSecret";

export type SentencePart = { text: string } | { slot: Slot };

export const GRANOLA_SENTENCE: SentencePart[] = [
	{ text: "Meeting notes ready" },
	{ slot: "endpoint" },
	{ slot: "signingSecret" },
];

export const GRANOLA_MENU: TriggerMenuEntry<GranolaConfig>[] = [
	{ label: "Meeting notes ready", create: createGranolaConfig },
];

export function createGranolaConfig(): GranolaConfig {
	return { kind: "granola", event: "note.generated" };
}
