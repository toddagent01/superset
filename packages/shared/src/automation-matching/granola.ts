import type { BaseMatchableEvent, MatchResult } from "./core";
import { no } from "./core";

/**
 * A Granola delivery, which carries no note content — only which note and
 * what happened to it. `noteId` is here for the run context rather than for
 * matching: the agent fetches the note through the Granola MCP plugin.
 */
export type GranolaMatchableEvent = BaseMatchableEvent & {
	provider: "granola";
	noteId: string;
};

/**
 * Whether a Granola trigger config accepts this delivery.
 *
 * Only the event type, because that is all a delivery says. Everything a
 * Circleback trigger narrows on — title, tags, attendees — is absent from
 * Granola's payload by design, and which notes are delivered at all is settled
 * on Granola's side by the endpoint's scopes and folder filter.
 */
export function granolaTriggerMatches(
	config: { event: string },
	event: GranolaMatchableEvent,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	return { matches: true };
}
