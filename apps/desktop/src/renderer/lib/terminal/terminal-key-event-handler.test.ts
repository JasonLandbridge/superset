import { describe, expect, it, mock } from "bun:test";

mock.module("renderer/hotkeys", () => ({
	resolveHotkeyFromEvent: () => null,
}));

const { createTerminalKeyEventHandler } = await import(
	"./terminal-key-event-handler"
);

function keyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		type: "keydown",
		code: "Enter",
		key: "Enter",
		metaKey: false,
		altKey: false,
		ctrlKey: false,
		shiftKey: false,
		preventDefault: mock(() => {}),
		...overrides,
	} as KeyboardEvent;
}

function terminal() {
	return {
		hasSelection: mock(() => false),
		input: mock(() => {}),
		selectAll: mock(() => {}),
	};
}

describe("createTerminalKeyEventHandler", () => {
	it("sends Shift+Enter as the TUI newline sequence", () => {
		const xterm = terminal();
		const event = keyboardEvent({ shiftKey: true });
		const handledByXterm = createTerminalKeyEventHandler(xterm as never, {
			platform: "Linux x86_64",
		})(event);

		expect(handledByXterm).toBe(false);
		expect(event.preventDefault).toHaveBeenCalled();
		expect(xterm.input).toHaveBeenCalledWith("\x1b\r", true);
	});
});
