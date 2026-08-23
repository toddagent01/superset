import type {
	DraftTrigger,
	TriggerProblem,
} from "@superset/shared/automation-triggers";
import { INTEGRATIONS } from "@superset/shared/integrations";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuArrowUpRight, LuTrash2 } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { type ProviderOptions, providerFor } from "../providers";
import type { OptionGroupState } from "../providers/types";
import { CHIP_INVALID } from "./chipStyles";

interface TriggerSentenceProps {
	trigger: DraftTrigger;
	onChange: (next: DraftTrigger) => void;
	onRemove: () => void;
	options: ProviderOptions;
	optionState?: Record<string, OptionGroupState>;
	/** This row's problems, already filtered to it by the editor. */
	problems?: TriggerProblem[];
	/** Trailing "Next run ..." text for a schedule row. */
	nextRun?: ReactNode;
	/**
	 * True when this provider needs an integration nobody has connected yet.
	 * The row still renders its sentence — a trigger configured before the
	 * integration was disconnected should keep showing what it watches — but
	 * it is inert, and says why.
	 */
	requiresConnection?: boolean;
	disabled?: boolean;
}

/**
 * One trigger, rendered as a sentence.
 *
 * This knows nothing about any provider. It finds the one that owns the config
 * and hands it the row's state; the provider decides what words and chips the
 * sentence is made of. Row chrome — the leading icon and the remove button —
 * lives here so every provider's row looks the same.
 */
export function TriggerSentence({
	trigger,
	onChange,
	onRemove,
	options,
	optionState,
	problems,
	nextRun,
	requiresConnection,
	disabled,
}: TriggerSentenceProps) {
	const config = trigger.config;
	const provider = providerFor(config);
	const Icon = provider.icon;

	// A banner naming the row is not enough when a sentence has three chips that
	// could each be the empty one.
	const invalid = new Set((problems ?? []).map((p) => p.field));

	// The web app owns every connect flow, because that is where the browser
	// session lives; this only has to point at the right page.
	const webPath = INTEGRATIONS.find(
		(integration) => integration.provider === provider.connectionProvider,
	)?.webPath;

	return (
		// select-text: the renderer body sets user-select: none, and the
		// sentence is prose that opts back in.
		<div className="group flex min-h-10 select-text flex-wrap items-center gap-1.5 rounded-[8px] px-2 py-1.5 hover:bg-foreground/[0.03]">
			<Icon className="size-4 shrink-0 text-muted-foreground" />

			{provider.renderSentence(config, {
				triggerId: trigger.id,
				set: (patch) =>
					onChange({ ...trigger, config: { ...config, ...patch } as never }),
				mark: (field) => (invalid.has(field) ? CHIP_INVALID : undefined),
				options,
				optionState,
				disabled: disabled || requiresConnection,
				nextRun,
			})}

			{requiresConnection && (
				<>
					<span className="text-[13px] text-amber-600 dark:text-amber-400">
						Requires connection
					</span>
					{webPath && (
						<Button
							type="button"
							size="sm"
							onClick={() =>
								window.open(`${env.NEXT_PUBLIC_WEB_URL}${webPath}`, "_blank")
							}
							className="ml-auto h-7 gap-1 bg-amber-500/90 text-[13px] text-amber-950 hover:bg-amber-500"
						>
							Connect
							<LuArrowUpRight className="size-3.5" />
						</Button>
					)}
				</>
			)}

			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Remove trigger"
				disabled={disabled}
				onClick={onRemove}
				className={cn(
					"size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground",
					// The Connect button already claimed the right edge.
					requiresConnection ? "ml-1" : "ml-auto",
				)}
			>
				<LuTrash2 className="size-3.5" />
			</Button>
		</div>
	);
}
