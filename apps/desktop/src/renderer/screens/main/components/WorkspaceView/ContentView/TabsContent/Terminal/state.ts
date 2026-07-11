import type { ColdRestoreState } from "./types";

/**
 * Module-level map to track pending detach timeouts.
 * This survives React StrictMode's unmount/remount cycle, allowing us to
 * cancel a pending detach if the component immediately remounts.
 */
export const pendingDetaches = new Map<string, NodeJS.Timeout>();

/**
 * Module-level map to track cold restore state across StrictMode cycles.
 * When cold restore is detected, we store the state here so it survives
 * the unmount/remount that StrictMode causes. Without this, the first mount
 * detects cold restore and sets state, but StrictMode unmounts and remounts
 * with fresh state, losing the cold restore detection.
 */
export const coldRestoreState = new Map<string, ColdRestoreState>();

/**
 * Terminal exit messages written by useTerminalStream and workspaceRun hooks.
 * Strip them from cold-restored scrollback so the old session's exit doesn't
 * leak into the restored view.
 */
export const TERMINAL_EXIT_PATTERN =
	/(?:\r?\n(?:\r?\n)?\[(?:Process exited(?: with code \d+)?|Session killed)\](?:\r?\n\[(?:Press any key to restart|Restart to start a new session)\])?\s*)+$/;

export function stripExitMessages(scrollback: string): string {
	return scrollback.replace(TERMINAL_EXIT_PATTERN, "");
}
