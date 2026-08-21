import { isEmptyScope } from "@superset/shared/automation-triggers";
import circlebackIconUrl from "renderer/assets/icons/circleback-icon.png";
import { env } from "renderer/env.renderer";
import { EndpointChip } from "../../TriggerSentence/components/EndpointChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import { brandIcon } from "../components/BrandIcon";
import { Sentence } from "../components/Sentence";
import { SigningSecretChip } from "../components/SigningSecretChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	CIRCLEBACK_MENU,
	CIRCLEBACK_SENTENCE,
	type CirclebackConfig,
	type Slot,
} from "./grammar";

export function circlebackWebhookUrl(triggerId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/circleback/webhook/${triggerId}`;
}

function renderSlot(
	config: CirclebackConfig,
	slot: Slot,
	index: number,
	{ set, disabled, triggerId }: SentenceContext,
) {
	switch (slot) {
		case "tags":
			return (
				<ScopeChip
					key={index}
					scope={config.tags}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any tag" either way, and an empty list would make that a
					// lie.
					onChange={(v) => set({ tags: isEmptyScope(v) ? { mode: "any" } : v })}
					options={[]}
					emptyLabel="Any tag"
					anyLabel="Any tag"
					allowCustom={{ placeholder: "Search tags or add your own..." }}
					disabled={disabled}
				/>
			);
		case "attendees":
			return (
				<ScopeChip
					key={index}
					scope={config.attendees}
					onChange={(v) =>
						set({ attendees: isEmptyScope(v) ? { mode: "any" } : v })
					}
					options={[]}
					emptyLabel="Any attendee"
					anyLabel="Any attendee"
					allowCustom={{ placeholder: "Search people or add an email..." }}
					disabled={disabled}
				/>
			);
		case "nameFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.nameFilter}
					onChange={(v) => set({ nameFilter: v })}
					emptyLabel="Any name"
					placeholder="Contains this text..."
					disabled={disabled}
				/>
			);
		case "endpoint":
			// The URL carries the saved row's id, so a row that has not been
			// saved yet has nothing to paste into Circleback.
			return (
				<EndpointChip
					key={index}
					url={triggerId ? circlebackWebhookUrl(triggerId) : null}
				/>
			);
		case "signingSecret":
			return (
				<SigningSecretChip
					key={index}
					triggerId={triggerId}
					providerName="Circleback"
					whereToFind="Circleback shows this when you paste the URL into its automation."
					disabled={disabled}
				/>
			);
	}
}

export const circlebackProvider: TriggerProvider<CirclebackConfig> = {
	kind: "circleback",
	label: "Circleback",
	icon: brandIcon(circlebackIconUrl, "Circleback"),
	menu: CIRCLEBACK_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={CIRCLEBACK_SENTENCE}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
};
