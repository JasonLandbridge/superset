import { describe, expect, it } from "bun:test";
import { resolveNotificationTarget } from "./resolve-notification-target";

describe("resolveNotificationTarget", () => {
	const createPane = (id: string, tabId: string, terminalId?: string) => ({
		id,
		tabId,
		type: "terminal" as const,
		name: "Terminal",
		data: terminalId ? { terminalId } : undefined,
	});

	const createChatPane = (id: string, tabId: string, sessionId: string) => ({
		id,
		tabId,
		type: "chat" as const,
		name: "Chat",
		chat: {
			sessionId,
			launchConfig: null,
		},
	});

	const createTab = (id: string, workspaceId: string) => ({
		id,
		name: "Tab",
		workspaceId,
		createdAt: Date.now(),
		layout: id,
	});

	describe("with all IDs provided", () => {
		it("returns the provided IDs", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "pane-1", tabId: "tab-1", workspaceId: "ws-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with missing workspaceId", () => {
		it("resolves workspaceId from tab", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "pane-1", tabId: "tab-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with missing tabId", () => {
		it("resolves tabId from pane", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "pane-1", workspaceId: "ws-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with missing tabId and workspaceId", () => {
		it("resolves both from pane and tab chain", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget({ paneId: "pane-1" }, state);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with only tabId", () => {
		it("resolves workspaceId from tab", () => {
			const state = {
				panes: {},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget({ tabId: "tab-1" }, state);

			expect(result).toEqual({
				paneId: undefined,
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with only workspaceId", () => {
		it("returns workspaceId with undefined pane and tab", () => {
			const state = {
				panes: {},
				tabs: [],
			};

			const result = resolveNotificationTarget({ workspaceId: "ws-1" }, state);

			expect(result).toEqual({
				paneId: undefined,
				tabId: undefined,
				workspaceId: "ws-1",
			});
		});
	});

	describe("with only sessionId", () => {
		it("resolves pane, tab, and workspace from the chat session", () => {
			const state = {
				panes: {
					"pane-1": createChatPane("pane-1", "tab-1", "session-1"),
				},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ sessionId: "session-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with stale paneId and no session match", () => {
		it("drops the invalid paneId instead of returning it", () => {
			const state = {
				panes: {},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "missing", tabId: "tab-1" },
				state,
			);

			expect(result).toEqual({
				paneId: undefined,
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with no resolvable workspaceId", () => {
		it("returns null when no IDs provided", () => {
			const state = { panes: {}, tabs: [] };

			const result = resolveNotificationTarget({}, state);

			expect(result).toBeNull();
		});

		it("returns null when pane not found", () => {
			const state = { panes: {}, tabs: [] };

			const result = resolveNotificationTarget({ paneId: "missing" }, state);

			expect(result).toBeNull();
		});

		it("returns null when tab not found", () => {
			const state = { panes: {}, tabs: [] };

			const result = resolveNotificationTarget({ tabId: "missing" }, state);

			expect(result).toBeNull();
		});
	});

	describe("with only terminalId", () => {
		it("resolves pane, tab, and workspace from the terminal", () => {
			const state = {
				panes: {
					"pane-1": createPane("pane-1", "tab-1", "term-1"),
				},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget({ terminalId: "term-1" }, state);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});

		it("returns null when terminal not found", () => {
			const state = {
				panes: {},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ terminalId: "missing-term" },
				state,
			);

			expect(result).toBeNull();
		});
	});

	describe("with terminalId and workspaceId (v2 fallback)", () => {
		it("resolves pane from terminal and workspace from event", () => {
			const state = {
				panes: {
					"pane-1": createPane("pane-1", "tab-1", "term-1"),
				},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ terminalId: "term-1", workspaceId: "ws-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with pane pointing to missing tab", () => {
		it("returns null when tab not in state", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "missing-tab") },
				tabs: [],
			};

			const result = resolveNotificationTarget({ paneId: "pane-1" }, state);

			expect(result).toBeNull();
		});
	});
});
