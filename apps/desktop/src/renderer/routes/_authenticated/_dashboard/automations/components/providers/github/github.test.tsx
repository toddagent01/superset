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
const { githubProvider } = await import("./github");
const { createGithubConfig } = await import("./grammar");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const REPOS = [
	{ id: "10", label: "superset", hint: "superset-sh" },
	{ id: "20", label: "domains", hint: "superset-sh" },
];

/**
 * Renders one GitHub row and reads it back as the sentence a person sees.
 * Joined from the row's own parts, not textContent: the spaces a reader sees
 * are flex gaps, so textContent runs the words together.
 */
async function row(config: Record<string, unknown>) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<TriggerSentence
				trigger={{ id: "t1", config } as never}
				onChange={() => {}}
				onRemove={() => {}}
				options={{ github: { repositories: REPOS, people: [], viewer: [] } }}
			/>,
		);
	});
	const parts = [...(view.container.firstElementChild?.children ?? [])]
		.map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
		.filter(Boolean);
	return {
		sentence: parts.join(" "),
		ui: within(view.baseElement as HTMLElement),
	};
}

const warningsFor = (config: Record<string, unknown>, viewer: unknown[] = []) =>
	githubProvider.runtimeWarnings?.(config as never, {
		github: { viewer: viewer as never },
	}) ?? [];

describe("the GitHub row reads as a sentence", () => {
	test("a pull request trigger names where and who", async () => {
		const { sentence } = await row({
			...createGithubConfig("pull_request.opened"),
			repositories: { mode: "list", ids: ["10"] },
		});
		expect(sentence).toBe("PR opened in superset by Anyone");
	});

	// The comment events are the only ones carrying two different people —
	// whoever wrote the comment, and whoever opened the thing commented on.
	test("a comment trigger keeps the commenter and the author apart", async () => {
		const { sentence } = await row({
			...createGithubConfig("comment_added"),
			repositories: { mode: "list", ids: ["10"] },
		});
		expect(sentence).toBe(
			"Any comment by Anyone on a PR by Anyone in superset",
		);
	});

	test("a push trigger names the branch before the repository", async () => {
		const { sentence } = await row({
			...createGithubConfig("push_to_branch"),
			repositories: { mode: "list", ids: ["10"] },
		});
		expect(sentence).toBe("Push to Any branch in superset by Anyone");
	});
});

describe("the GitHub row starts unfinished on purpose", () => {
	// An empty repository list matches nothing, so a half-built trigger cannot
	// fire on every repository; the form refuses to save until one is chosen.
	test("a new trigger has no repository and says so", async () => {
		const { sentence } = await row(createGithubConfig("pull_request.opened"));
		expect(sentence).toBe("PR opened in Select repo by Anyone");
	});

	test("one repository is named rather than counted", async () => {
		const { sentence } = await row({
			...createGithubConfig("pull_request.opened"),
			repositories: { mode: "list", ids: ["20"] },
		});
		expect(sentence).toContain("domains");
	});
});

describe("the GitHub row filters by person three ways", () => {
	test("anyone, by default", async () => {
		const { sentence } = await row(createGithubConfig("pull_request.opened"));
		expect(sentence).toContain("Anyone");
	});

	test('"Me" resolves at delivery, so the row just says Me', async () => {
		const { sentence } = await row({
			...createGithubConfig("pull_request.opened"),
			repositories: { mode: "list", ids: ["10"] },
			actor: { mode: "me" },
		});
		expect(sentence).toBe("PR opened in superset by Me");
	});

	// A typed login labels itself; there is no roster to look it up in, which
	// is the whole reason the field takes typed names.
	test("a named person shows the name that was typed", async () => {
		const { sentence } = await row({
			...createGithubConfig("pull_request.opened"),
			repositories: { mode: "list", ids: ["10"] },
			actor: { mode: "list", ids: ["saddlepaddle"] },
		});
		expect(sentence).toBe("PR opened in superset by saddlepaddle");
	});

	test("several named people are counted", async () => {
		const { sentence } = await row({
			...createGithubConfig("pull_request.opened"),
			repositories: { mode: "list", ids: ["10"] },
			actor: { mode: "list", ids: ["alice", "bob"] },
		});
		expect(sentence).toContain("2 people");
	});

	// An empty set matches nobody and blocks saving, so it reads as unset even
	// though a mode was deliberately chosen.
	test("choosing specific people and naming none reads as unset", async () => {
		const { sentence } = await row({
			...createGithubConfig("pull_request.opened"),
			repositories: { mode: "list", ids: ["10"] },
			actor: { mode: "list", ids: [] },
		});
		expect(sentence).toContain("Specific People");
	});
});

describe('the GitHub row says when "Me" cannot resolve', () => {
	const meConfig = {
		...createGithubConfig("pull_request.opened"),
		actor: { mode: "me" },
	};

	// Configured fine, permanently silent: "Me" resolves against the owner's
	// GitHub identity when each event arrives, and there isn't one.
	test("warns when no GitHub account is connected for the viewer", () => {
		const warnings = warningsFor(meConfig);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("no GitHub account is connected");
	});

	test("stays quiet once an account resolves", () => {
		expect(warningsFor(meConfig, [{ id: "42", label: "satya" }])).toEqual([]);
	});

	test("stays quiet when no scope asks for Me", () => {
		expect(warningsFor(createGithubConfig("pull_request.opened"))).toEqual([]);
	});
});
