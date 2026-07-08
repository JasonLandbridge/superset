import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { INPUT_MODE_DISARM_SEQUENCE } from "shared/terminal-input-modes";
import { isTerminalAttachCanceledMessage } from "../attach-cancel";
import { coldRestoreState, stripExitMessages } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalStreamEvent,
} from "../types";
import { scrollToBottom } from "../utils";

export interface UseTerminalColdRestoreOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	isFocusedRef: React.MutableRefObject<boolean>;
	didFirstRenderRef: React.MutableRefObject<boolean>;
	pendingInitialStateRef: React.MutableRefObject<CreateOrAttachResult | null>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	createOrAttachRef: React.MutableRefObject<CreateOrAttachMutate>;
	setConnectionError: (error: string | null) => void;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
}

export interface UseTerminalColdRestoreReturn {
	isRestoredMode: boolean;
	restoredCwd: string | null;
	restoredCommand: string | null;
	setIsRestoredMode: (value: boolean) => void;
	setRestoredCwd: (value: string | null) => void;
	setRestoredCommand: (value: string | null) => void;
	handleRetryConnection: () => void;
	handleStartShell: () => void;
}

/**
 * Hook to manage cold restore (reboot recovery) functionality.
 *
 * Handles:
 * - Retry connection after daemon loss
 * - Starting new shell from restored scrollback
 * - Managing cold restore overlay state
 */
export function useTerminalColdRestore({
	paneId,
	tabId,
	workspaceId,
	xtermRef,
	isStreamReadyRef,
	isExitedRef,
	wasKilledByUserRef,
	isFocusedRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	pendingEventsRef,
	createOrAttachRef,
	setConnectionError,
	setExitStatus,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
}: UseTerminalColdRestoreOptions): UseTerminalColdRestoreReturn {
	const [isRestoredMode, setIsRestoredMode] = useState(false);
	const [restoredCwd, setRestoredCwd] = useState<string | null>(null);
	const [restoredCommand, setRestoredCommand] = useState<string | null>(null);

	// Ref for restoredCwd to use in callbacks
	const restoredCwdRef = useRef(restoredCwd);
	restoredCwdRef.current = restoredCwd;

	// Ref for restoredCommand to use in callbacks
	const restoredCommandRef = useRef(restoredCommand);
	restoredCommandRef.current = restoredCommand;

	const handleRetryConnection = useCallback(() => {
		setConnectionError(null);
		const xterm = xtermRef.current;
		if (!xterm) return;

		isStreamReadyRef.current = false;
		pendingInitialStateRef.current = null;

		createOrAttachRef.current(
			{
				paneId,
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result: CreateOrAttachResult) => {
					const currentXterm = xtermRef.current;
					if (!currentXterm) return;

					setConnectionError(null);
					currentXterm.writeln("\x1b[90m[Reconnected]\x1b[0m");

					if (result.isColdRestore) {
						const scrollback =
							result.snapshot?.snapshotAnsi ?? result.scrollback;
						// Fall back to pane's workspaceRun.command when
						// terminal history metadata lacks the command.
						const command =
							result.previousCommand ||
							useTabsStore.getState().panes[paneId]?.workspaceRun?.command ||
							null;
						coldRestoreState.set(paneId, {
							isRestored: true,
							cwd: result.previousCwd || null,
							scrollback,
							command,
						});
						setIsRestoredMode(true);
						setRestoredCwd(result.previousCwd || null);
						setRestoredCommand(command);

						currentXterm.clear();
						if (scrollback) {
							const cleaned = stripExitMessages(scrollback);
							if (cleaned) {
								currentXterm.write(cleaned, () => {
									requestAnimationFrame(() => {
										if (xtermRef.current !== currentXterm) return;
										scrollToBottom(currentXterm);
									});
								});
							}
						}

						didFirstRenderRef.current = true;
						return;
					}

					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					if (isFocusedRef.current) {
						currentXterm.focus();
					}
				},
				onError: (error: { message?: string }) => {
					if (isTerminalAttachCanceledMessage(error.message)) {
						return;
					}
					if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
						wasKilledByUserRef.current = true;
						isExitedRef.current = true;
						isStreamReadyRef.current = false;
						setExitStatus("killed");
						setConnectionError(null);
						return;
					}
					setConnectionError(error.message || "Connection failed");
					isStreamReadyRef.current = true;
					flushPendingEvents();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		isFocusedRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
	]);

	const handleStartShell = useCallback(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;

		// Drop any queued events from the pre-restore session
		pendingEventsRef.current = [];

		// Acknowledge cold restore to main process
		trpcClient.terminal.ackColdRestore.mutate({ paneId }).catch((error) => {
			console.warn("[Terminal] Failed to acknowledge cold restore:", {
				paneId,
				error: error instanceof Error ? error.message : String(error),
			});
		});

		// Disarm input-reporting modes before the fresh shell attaches: the
		// replayed scrollback is sanitized, but the xterm may still carry
		// armed modes from the pre-crash session (#5508).
		xterm.write(INPUT_MODE_DISARM_SEQUENCE);

		// Add visual separator
		xterm.write("\r\n\x1b[90m─── Session Contents Restored ───\x1b[0m\r\n\r\n");

		// Reset state for new session
		isStreamReadyRef.current = false;
		isExitedRef.current = false;
		wasKilledByUserRef.current = false;
		setExitStatus(null);
		pendingInitialStateRef.current = null;
		resetModes();

		// Resolve the command to re-execute. Priority:
		// 1. Command from terminal history metadata (stored by previous session)
		// 2. Command from pane's workspaceRun (stored by preset/launcher)
		const currentColdRestore = coldRestoreState.get(paneId);
		const resolvedCommand =
			restoredCommandRef.current || currentColdRestore?.command || undefined;

		// Create new session with previous cwd and command
		createOrAttachRef.current(
			{
				paneId,
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
				cwd: restoredCwdRef.current || undefined,
				command: resolvedCommand,
				skipColdRestore: true,
				allowKilled: true,
			},
			{
				onSuccess: (result: CreateOrAttachResult) => {
					pendingInitialStateRef.current = result;
					maybeApplyInitialState();

					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);

					setTimeout(() => {
						const currentXterm = xtermRef.current;
						if (currentXterm) {
							currentXterm.focus();
						}
					}, 0);
				},
				onError: (error: { message?: string }) => {
					if (isTerminalAttachCanceledMessage(error.message)) {
						return;
					}
					console.error("[Terminal] Failed to start shell:", error);
					setConnectionError(error.message || "Failed to start shell");
					setIsRestoredMode(false);
					coldRestoreState.delete(paneId);
					isStreamReadyRef.current = true;
					flushPendingEvents();
				},
			},
		);
	}, [
		paneId,
		tabId,
		workspaceId,
		xtermRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		pendingInitialStateRef,
		pendingEventsRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
	]);

	return {
		isRestoredMode,
		restoredCwd,
		restoredCommand,
		setIsRestoredMode,
		setRestoredCwd,
		setRestoredCommand,
		handleRetryConnection,
		handleStartShell,
	};
}
