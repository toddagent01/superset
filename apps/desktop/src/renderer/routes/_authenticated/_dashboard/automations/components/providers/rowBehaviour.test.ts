import { describe, expect, test } from "bun:test";
import { triggerEventLabel } from "./eventLabel";
import { githubProvider } from "./github/github";
import { slackProvider } from "./slack/slack";
import type { ProviderOptions } from "./types";

/**
 * The parts of a row that are decisions rather than rendering: which warnings a
 * configured-but-silent trigger earns, and what a row calls itself when its
 * sentence is not worth showing. No DOM involved — these are functions on the
 * provider, and testing them through a render would only make them slower to
 * run and harder to read.
 */

const channels = (
	...rows: { id: string; label: string; botMember?: boolean }[]
): ProviderOptions => ({ slack: { channels: rows } });

describe("slack runtime warnings", () => {
	// Slack only delivers message events for channels the bot is in, so this is
	// the difference between a trigger that works and one that is silent
	// forever while looking perfectly configured.
	test("names the channels the bot has not been invited to", () => {
		const warnings = slackProvider.runtimeWarnings?.(
			{
				kind: "slack",
				event: "message",
				channels: { mode: "list", ids: ["C1", "C2"] },
			} as never,
			channels(
				{ id: "C1", label: "general", botMember: true },
				{ id: "C2", label: "secret", botMember: false },
			),
		);
		expect(warnings).toEqual([
			"This trigger will not run for messages in secret until @Superset is invited.",
		]);
	});

	test("says nothing when the bot is in every selected channel", () => {
		const warnings = slackProvider.runtimeWarnings?.(
			{
				kind: "slack",
				event: "message",
				channels: { mode: "list", ids: ["C1"] },
			} as never,
			channels({ id: "C1", label: "general", botMember: true }),
		);
		expect(warnings).toEqual([]);
	});

	// channel_created arrives workspace-wide, so membership is irrelevant and
	// warning about it would be noise on a trigger that works fine.
	test("says nothing for channel_created, which is not per-channel", () => {
		const warnings = slackProvider.runtimeWarnings?.(
			{
				kind: "slack",
				event: "channel_created",
				channels: { mode: "list", ids: ["C2"] },
			} as never,
			channels({ id: "C2", label: "secret", botMember: false }),
		);
		expect(warnings).toEqual([]);
	});

	test("says nothing while the roster has not arrived", () => {
		const warnings = slackProvider.runtimeWarnings?.(
			{
				kind: "slack",
				event: "message",
				channels: { mode: "list", ids: ["C2"] },
			} as never,
			{},
		);
		expect(warnings).toEqual([]);
	});
});

describe("github runtime warnings", () => {
	const meConfig = {
		kind: "github",
		event: "pull_request.opened",
		actor: { mode: "me" },
	} as never;

	test('warns when "Me" cannot resolve to a connected account', () => {
		const warnings = githubProvider.runtimeWarnings?.(meConfig, {
			github: { viewer: [] },
		});
		expect(warnings).toHaveLength(1);
		expect(warnings?.[0]).toContain("no GitHub account is connected");
	});

	test('says nothing once "Me" resolves', () => {
		const warnings = githubProvider.runtimeWarnings?.(meConfig, {
			github: { viewer: [{ id: "42", label: "satya" }] },
		});
		expect(warnings).toEqual([]);
	});

	test("says nothing when no scope asks for Me", () => {
		const warnings = githubProvider.runtimeWarnings?.(
			{
				kind: "github",
				event: "pull_request.opened",
				actor: { mode: "any" },
			} as never,
			{ github: { viewer: [] } },
		);
		expect(warnings).toEqual([]);
	});
});

describe("triggerEventLabel", () => {
	// The label comes off the Add Trigger menu so it cannot drift from it.
	test("reads a nested event's name off the menu", () => {
		const label = triggerEventLabel(
			githubProvider as never,
			{
				kind: "github",
				event: "pull_request.opened",
			} as never,
		);
		expect(label.length).toBeGreaterThan(0);
		expect(label).not.toBe(githubProvider.label);
	});

	test("falls back to the provider for an event the menu no longer names", () => {
		const label = triggerEventLabel(
			githubProvider as never,
			{
				kind: "github",
				event: "an_event_that_was_removed",
			} as never,
		);
		expect(label).toBe(githubProvider.label);
	});

	test("falls back to the provider for a config with no event at all", () => {
		const label = triggerEventLabel(
			slackProvider as never,
			{
				kind: "slack",
			} as never,
		);
		expect(label).toBe(slackProvider.label);
	});
});
