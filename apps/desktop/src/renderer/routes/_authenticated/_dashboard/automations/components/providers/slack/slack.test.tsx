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
 * Renders one Slack row in a given state and hands back its parts.
 *
 * `chip` finds a word of the sentence by the text on it, which is how a person
 * finds it too. `sentence` joins the row's own children rather than reading
 * textContent, because the spaces a reader sees are flex gaps.
 */
async function row(
	config: Record<string, unknown>,
	props: Record<string, unknown> = {},
) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<TriggerSentence
				trigger={{ id: "t1", config } as never}
				onChange={() => {}}
				onRemove={() => {}}
				options={{ slack: { channels: CHANNELS, people: [] } }}
				{...props}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	return {
		ui,
		chip: (name: string | RegExp) => ui.getByRole("button", { name }),
		queryChip: (name: string | RegExp) => ui.queryByRole("button", { name }),
		open: async (name: string | RegExp) => {
			await act(async () => {
				ui.getByRole("button", { name }).click();
			});
			return ui;
		},
		sentence: [...(view.container.firstElementChild?.children ?? [])]
			.map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.join(" "),
	};
}

const message = (over: Record<string, unknown> = {}) => ({
	kind: "slack",
	event: "message_in_channel",
	messageFilter: null,
	actor: { mode: "any" },
	channels: { mode: "list", ids: [] },
	completionReaction: "white_check_mark",
	...over,
});

describe("a Slack message row that was just added", () => {
	test("asks for a channel", async () => {
		const { chip } = await row(message());
		expect(chip("Select channels")).toBeDefined();
	});

	test("matches any message by default", async () => {
		const { chip } = await row(message());
		expect(chip("Any message")).toBeDefined();
	});

	// Ahead-of-time people filters were removed from Slack rows: every new
	// trigger listens to anyone, so this is a statement rather than a choice.
	// A legacy row that still carries a list keeps its chip (below).
	test("listens to anyone, and does not offer to narrow it", async () => {
		const { ui, queryChip } = await row(message());
		expect(ui.getByText("Anyone")).toBeDefined();
		expect(queryChip("Anyone")).toBeNull();
	});

	test("a row saved with a people filter keeps its chip", async () => {
		const { chip } = await row(
			message({ actor: { mode: "list", ids: ["U1"] } }),
		);
		expect(chip("U1")).toBeDefined();
	});

	// A row saved before this field existed has no key at all, and the schema
	// defaults it on save, so the chip has to show the same default.
	test("acknowledges with a check mark by default", async () => {
		const { chip } = await row(message());
		expect(chip("✅")).toBeDefined();
	});

	// Slack only delivers events from channels the bot is in, so "any channel"
	// would promise more than it can watch.
	test("does not offer to watch every channel", async () => {
		const { open } = await row(message());
		const picker = await open("Select channels");
		expect(picker.queryByText("Any channel")).toBeNull();
	});
});

describe("a Slack row that names its channels", () => {
	test("names one channel", async () => {
		const { chip } = await row(
			message({ channels: { mode: "list", ids: ["C1"] } }),
		);
		expect(chip("#general")).toBeDefined();
	});

	test("counts several", async () => {
		const { chip } = await row(
			message({ channels: { mode: "list", ids: ["C1", "C2"] } }),
		);
		expect(chip("2 channels")).toBeDefined();
	});
});

describe("a Slack row watching a channel the bot is not in", () => {
	// Configured fine, silent forever: this is the difference between a trigger
	// that works and one nobody can tell is broken.
	const warningsFor = (config: Record<string, unknown>) =>
		slackProvider.runtimeWarnings?.(config as never, {
			slack: { channels: CHANNELS },
		}) ?? [];

	test("names the channel and says who to invite", () => {
		expect(
			warningsFor(message({ channels: { mode: "list", ids: ["C1", "C2"] } })),
		).toEqual([
			"This trigger will not run for messages in #secret until @Superset is invited.",
		]);
	});

	test("stays quiet when the bot is in every channel it watches", () => {
		expect(
			warningsFor(message({ channels: { mode: "list", ids: ["C1"] } })),
		).toEqual([]);
	});

	// A new channel is announced workspace-wide, so membership is irrelevant
	// and warning about it would be noise on a trigger that works.
	test("stays quiet for channel_created", () => {
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
				message({ channels: { mode: "list", ids: ["C2"] } }) as never,
				{},
			),
		).toEqual([]);
	});
});

describe("a Slack row whose integration is not connected", () => {
	const disconnected = () => row(message(), { requiresConnection: true });

	test("collapses to the name of the trigger", async () => {
		const { ui } = await disconnected();
		expect(ui.getByText("Message in channel")).toBeDefined();
	});

	test("says a connection is required and offers the fix", async () => {
		const { ui, chip } = await disconnected();
		expect(ui.getByText("Requires connection")).toBeDefined();
		expect(chip(/Connect/)).toBeDefined();
	});

	test("hides the pickers entirely", async () => {
		const { queryChip } = await disconnected();
		expect(queryChip("Select channels")).toBeNull();
	});
});

/**
 * The order and wording of the parts, which per-element queries cannot see:
 * `getByRole` finds a chip wherever it sits, so only the whole sentence catches
 * a slot moving or a connecting word changing.
 */
describe("the wording of a Slack row", () => {
	// The filter chip is the subject rather than trailing a "Message" label it
	// would collide with.
	test("a message trigger leads with the filter, then who, then where", async () => {
		const { sentence } = await row(message());
		expect(sentence).toBe(
			"Any message from Anyone in Select channels ; react with ✅ upon completion",
		);
	});

	// Actor beside its verb: at the end it read as the message's author rather
	// than the reactor's.
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
