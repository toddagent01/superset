import granolaIconUrl from "renderer/assets/icons/granola-icon.svg";
import { env } from "renderer/env.renderer";
import { EndpointChip } from "../../TriggerSentence/components/EndpointChip";
import { brandIcon } from "../components/BrandIcon";
import { Sentence } from "../components/Sentence";
import { SigningSecretChip } from "../components/SigningSecretChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	GRANOLA_MENU,
	GRANOLA_SENTENCE,
	type GranolaConfig,
	type Slot,
} from "./grammar";

export function granolaWebhookUrl(triggerId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/granola/webhook/${triggerId}`;
}

function renderSlot(
	_config: GranolaConfig,
	slot: Slot,
	index: number,
	{ disabled, triggerId }: SentenceContext,
) {
	switch (slot) {
		case "endpoint":
			// The URL carries the saved row's id, so a row that has not been
			// saved yet has nothing to register in Granola.
			return (
				<EndpointChip
					key={index}
					url={triggerId ? granolaWebhookUrl(triggerId) : null}
				/>
			);
		case "signingSecret":
			return (
				<SigningSecretChip
					key={index}
					triggerId={triggerId}
					providerName="Granola"
					whereToFind="Granola shows this once, when you register this URL under Settings → Connectors → Webhooks (Business and Enterprise plans) and subscribe it to note.generated."
					disabled={disabled}
				/>
			);
	}
}

export const granolaProvider: TriggerProvider<GranolaConfig> = {
	kind: "granola",
	label: "Granola",
	icon: brandIcon(granolaIconUrl, "Granola"),
	menu: GRANOLA_MENU,
	renderSentence: (config, ctx) => (
		<Sentence
			parts={GRANOLA_SENTENCE}
			renderSlot={(slot, index) => renderSlot(config, slot, index, ctx)}
		/>
	),
	// No runtimeWarnings: those describe a fact that stops a valid trigger from
	// firing, and Granola's setup state is not observable from here. The unset
	// signing-secret chip is the signal that a row is not live yet.
};
