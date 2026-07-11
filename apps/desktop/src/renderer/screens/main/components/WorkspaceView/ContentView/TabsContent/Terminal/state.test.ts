import { afterEach, describe, expect, it } from "bun:test";
import { coldRestoreState, stripExitMessages } from "./state";

describe("stripExitMessages", () => {
	it("removes trailing [Process exited] + [Press any key to restart]", () => {
		const input =
			"some scrollback content\r\n\r\n[Process exited]\r\n[Press any key to restart]";
		expect(stripExitMessages(input)).toBe("some scrollback content");
	});

	it("removes trailing [Process exited with code 1] + restart", () => {
		const input =
			"more content\r\n\r\n[Process exited with code 1]\r\n[Press any key to restart]";
		expect(stripExitMessages(input)).toBe("more content");
	});

	it("removes trailing [Session killed] + restart", () => {
		const input =
			"content before\r\n\r\n[Session killed]\r\n[Press any key to restart]";
		expect(stripExitMessages(input)).toBe("content before");
	});

	it("removes only the trailing exit block, preserves earlier content", () => {
		const input =
			"line 1\r\nline 2\r\n\r\n[Process exited]\r\n[Press any key to restart]";
		expect(stripExitMessages(input)).toBe("line 1\r\nline 2");
	});

	it("does not strip when exit message is in the middle", () => {
		const input =
			"before\r\n[Process exited]\r\nafter\r\n[Press any key to restart]";
		// Only trailing exit blocks are stripped; mid-content is left alone
		expect(stripExitMessages(input)).toBe(input);
	});

	it("handles empty input", () => {
		expect(stripExitMessages("")).toBe("");
	});

	it("handles input with only exit messages", () => {
		// The regex requires a leading line break before exit messages.
		// Without it, exit-like text at the start of scrollback is preserved
		// (it may be literal text, not the terminal's exit footer).
		expect(
			stripExitMessages(
				"\r\n\r\n[Process exited]\r\n[Press any key to restart]",
			),
		).toBe("");
	});

	it("preserves exit-like text at the very start of content", () => {
		// The regex anchors to trailing content via leading \r?\n.
		// Content like "[Process exited]" at position 0 is literal
		// scrollback, not the terminal's exit footer.
		expect(
			stripExitMessages("[Process exited]\r\n[Press any key to restart]"),
		).toBe("[Process exited]\r\n[Press any key to restart]");
	});

	it("preserves content when no exit messages are present", () => {
		expect(stripExitMessages("plain content")).toBe("plain content");
	});

	it("handles multiple trailing exit blocks", () => {
		// Doubled exit — the regex should strip all trailing repetitions
		const input =
			"content\r\n\r\n[Process exited]\r\n[Press any key to restart]\r\n\r\n[Process exited]\r\n[Press any key to restart]";
		expect(stripExitMessages(input)).toBe("content");
	});

	it("handles exit with Restart to start message", () => {
		const input =
			"content\r\n\r\n[Process exited]\r\n[Restart to start a new session]";
		expect(stripExitMessages(input)).toBe("content");
	});
});

describe("coldRestoreState", () => {
	afterEach(() => {
		coldRestoreState.clear();
	});

	it("sets and gets cold restore state", () => {
		coldRestoreState.set("pane-1", {
			isRestored: true,
			cwd: "/home/user",
			scrollback: "test",
			command: "pi",
		});

		expect(coldRestoreState.get("pane-1")?.isRestored).toBe(true);
		expect(coldRestoreState.get("pane-1")?.cwd).toBe("/home/user");
	});

	it("returns undefined for unknown pane", () => {
		expect(coldRestoreState.get("nonexistent")).toBeUndefined();
	});

	it("deletes state", () => {
		coldRestoreState.set("pane-2", {
			isRestored: true,
			cwd: null,
			scrollback: null,
			command: null,
		});
		expect(coldRestoreState.get("pane-2")?.isRestored).toBe(true);

		coldRestoreState.delete("pane-2");
		expect(coldRestoreState.get("pane-2")).toBeUndefined();
	});

	it("isRestored flag survives across get/check pattern (race condition safety)", () => {
		// Simulate the race condition: handleRetryConnection sets
		// coldRestoreState and then stream events fire handleTerminalExit
		// BEFORE the next React render (where isRestoredModeRef would sync).

		coldRestoreState.set("pane-3", {
			isRestored: true,
			cwd: "/home/user",
			scrollback: "old scrollback",
			command: null,
		});

		// handleTerminalExit gate — uses coldRestoreState, not isRestoredModeRef
		const shouldSuppress = coldRestoreState.get("pane-3")?.isRestored;
		expect(shouldSuppress).toBe(true);

		// After handleStartShell, coldRestoreState is deleted
		coldRestoreState.delete("pane-3");
		expect(coldRestoreState.get("pane-3")?.isRestored).toBeUndefined();
	});
});
