import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, within } = await import("@testing-library/react");
const { TriggerSentence } = await import("../../TriggerSentence");
const { slackProvider } = await import("./slack");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const CHANNELS = [
	{ id: "C1", label: "#general", botMember: true },
	{ id: "C2", label: "#secret", botMember: false },
];

/**
 * Renders one Slack row and reads it back as the sentence a person sees —
 * words and chip labels, in order. Asserting the whole sentence rather than
 * individual chips is the point: this file is meant to read as the definition
 * of the row, so a change to the wording has to be made here on purpose.
 */
async function row(config: Record<string, unknown>) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<TriggerSentence
				trigger={{ id: "t1", config } as never}
				onChange={() => {}}
				onRemove={() => {}}
				options={{ slack: { channels: CHANNELS, people: [] } }}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	// Joined from the row's own parts, not textContent: the spaces a reader
	// sees are flex gaps, so textContent runs the words together.
	const parts = [...(view.container.firstElementChild?.children ?? [])]
		.map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
		.filter(Boolean);
	return { sentence: parts.join(" "), ui };
}

/** The warnings this row earns for the world it is pointed at. */
const warningsFor = (config: Record<string, unknown>) =>
	slackProvider.runtimeWarnings?.(config as never, {
		slack: { channels: CHANNELS },
	}) ?? [];

describe("the Slack row reads as a sentence", () => {
	test("a message trigger names its filter, who, where, and how it acknowledges", async () => {
		const { sentence } = await row({
			kind: "slack",
			event: "message_in_channel",
			messageFilter: null,
			actor: { mode: "any" },
			channels: { mode: "list", ids: [] },
			completionReaction: "white_check_mark",
		});
		expect(sentence).toBe(
			"Any message from Anyone in Select channels ; react with ✅ upon completion",
		);
	});

	test("a reaction trigger puts the actor beside its verb", async () => {
		const { sentence } = await row({
			kind: "slack",
			event: "reaction_added",
			emoji: { mode: "list", ids: [] },
			actor: { mode: "any" },
			channels: { mode: "list", ids: ["C1"] },
		});
		expect(sentence).toBe(
			"Reaction Select emoji added by Anyone to a message in #general",
		);
	});

	// A new channel is announced workspace-wide, so there is no channel to pick
	// and no membership to warn about.
	test("a channel-created trigger filters on the name and nothing else", async () => {
		const { sentence } = await row({
			kind: "slack",
			event: "channel_created",
			messageFilter: null,
			actor: { mode: "any" },
			channels: { mode: "any" },
		});
		expect(sentence).toBe("Channel created matching Any name");
	});
});

describe("the Slack row counts what it watches", () => {
	test("one channel is named, several are counted", async () => {
		const one = await row({
			kind: "slack",
			event: "reaction_added",
			emoji: { mode: "list", ids: [] },
			actor: { mode: "any" },
			channels: { mode: "list", ids: ["C1"] },
		});
		expect(one.sentence).toContain("#general");

		const many = await row({
			kind: "slack",
			event: "reaction_added",
			emoji: { mode: "list", ids: [] },
			actor: { mode: "any" },
			channels: { mode: "list", ids: ["C1", "C2"] },
		});
		expect(many.sentence).toContain("2 channels");
	});
});

describe("the Slack row says when it will stay silent", () => {
	// Slack only delivers message events for channels the bot is in, so this is
	// the difference between a trigger that works and one that is silent
	// forever while looking perfectly configured.
	test("names a channel @Superset has not been invited to", () => {
		expect(
			warningsFor({
				kind: "slack",
				event: "message_in_channel",
				channels: { mode: "list", ids: ["C1", "C2"] },
			}),
		).toEqual([
			"This trigger will not run for messages in #secret until @Superset is invited.",
		]);
	});

	test("stays quiet when the bot is in every channel it watches", () => {
		expect(
			warningsFor({
				kind: "slack",
				event: "message_in_channel",
				channels: { mode: "list", ids: ["C1"] },
			}),
		).toEqual([]);
	});

	test("stays quiet for channel_created, where membership is irrelevant", () => {
		expect(
			warningsFor({
				kind: "slack",
				event: "channel_created",
				channels: { mode: "list", ids: ["C2"] },
			}),
		).toEqual([]);
	});

	test("does not accuse a channel before the roster has arrived", () => {
		expect(
			slackProvider.runtimeWarnings?.(
				{
					kind: "slack",
					event: "message_in_channel",
					channels: { mode: "list", ids: ["C2"] },
				} as never,
				{},
			),
		).toEqual([]);
	});
});
