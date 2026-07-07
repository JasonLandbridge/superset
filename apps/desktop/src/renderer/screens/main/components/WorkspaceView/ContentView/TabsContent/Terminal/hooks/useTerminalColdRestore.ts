import type { CreateOrAttachResponse } from "@superset/pty-daemon/types";
import { createResettableTimer } from "lib/trpc/routers/terminal/utils/timers";
import { useEffect, useRef, useState } from "react";
import { getScrollbackLines } from "renderer/lib/terminal/scrollback-lines";
import {
	type ColdRestoreState,
	type UseTerminalRestoreOptions,
} from "../types";

const COL_STAGGER_DELAY_MS = 50;
const ROW_STAGGER_DELAY_MS = 100;

interface UseTerminalColdRestoreOptions extends UseTerminalRestoreOptions {
	scrollbackLines: number;
}

interface UseTerminalColdRestoreReturn {
	coldRestoreState: Map<string, ColdRestoreState>;
	enqueueColdRestore: (paneId: string, result: CreateOrAttachResponse) => void;
	applyColdRestore: (
		paneId: string,
		terminal: { write(data: string): void },
		onRestore?: (state: ColdRestoreState) => void,
	) => boolean;
	isRestoredMode: boolean;
	restoredCwd: string | null;
	restoredCommand: string | null;
}

/**
 * Manages terminal cold restore state across panes.
 *
 * When Superset detects an unclean shutdown (process was killed, machine
 * restarted, etc.), the daemon attempts to recover scrollback from the
 * previous session. This hook:
 *
 * 1. Stores the recovered scrollback per pane in a Map.
 * 2. Applies it to the xterm via writeSync / writeln when the terminal
 *    component mounts, before the PTY is attached — so the user sees
 *    their previous output immediately.
 * 3. Signals the daemon that cold restore is complete via ack.
 *
 * Architecture note: cold restore is per-pane, not per-tab. A tab may
 * contain multiple terminal panes, each with its own PTY session. The
 * daemon manages recovery per sessionId (derived from paneId).
 */
export function useTerminalColdRestore(
	options: UseTerminalColdRestoreOptions,
): UseTerminalColdRestoreReturn {
	const {
		getOrConnectTerminal,
		ackColdRestore,
		scrollbackLines,
	} = options;

	const [coldRestoreState, setColdRestoreState] = useState<
		Map<string, ColdRestoreState>
	>(new Map());
	const [isRestoredMode, setIsRestoredMode] = useState(false);
	const [restoredCwd, setRestoredCwd] = useState<string | null>(null);
	const [restoredCommand, setRestoredCommand] = useState<string | null>(null);
	const coldRestoreApplied = useRef(new Set<string>());
	const colStaggerRef = useRef(0);
	const rowStaggerRef = useRef(0);
	const isColdRestoreFirstRenderedPane = useRef<boolean>(true);

	/**
	 * Write scrollback lines to the terminal using writeSync to guarantee
	 * ordering and avoid PTY write races. Applied immediately when the
	 * cold-restored pane first renders (no debounce).
	 */
	const applyColdRestore = (
		paneId: string,
		terminal: { write(data: string): void },
		onRestore?: (state: ColdRestoreState) => void,
	): boolean => {
		const state = coldRestoreState.get(paneId);
		if (!state || !state.isRestored) return false;

		// Prevent race: xterm might resize and trigger `fit()` before our
		// write lands. Wait for the font to settle and the rows to be
		// correctly computed before restoring scrollback.
		coldRestoreApplied.current.add(paneId);

		if (state.scrollback) {
			const delay = calculateStaggerDelayMS(
				isColdRestoreFirstRenderedPane.current ? null : "subsequent",
				state.scrollback,
				{
					colStagger: colStaggerRef,
					rowStagger: rowStaggerRef,
				},
			);

			const timer = createResettableTimer(() => {
				const scrollback = state.scrollback;
				if (process.env.NODE_ENV === "development") {
					console.log(
						`[cold-restore] writing ${scrollback.length} scrollback bytes to terminal`,
					);
				}
				terminal.write(scrollback);
			}, delay);

			return () => {
				timer.reset();
			};
		}

		return false;
	};

	/**
	 * Queue a cold restore result from the daemon for a specific pane.
	 * Called when createOrAttach returns with `wasRecovered: true`.
	 */
	const enqueueColdRestore = (
		paneId: string,
		result: CreateOrAttachResponse,
	): void => {
		if (
			result.isColdRestore &&
			result.wasRecovered &&
			result.snapshot?.snapshotAnsi
		) {
			const scrollback = result.snapshot.snapshotAnsi;
			const coolRestoreAlreadyApplied = coldRestoreApplied.current.has(
				paneId,
			);

			if (!coolRestoreAlreadyApplied) {
				setColdRestoreState((prev) => {
					const next = new Map(prev);
						next.set(paneId, {
							isRestored: true,
							cwd: result.previousCwd || null,
							scrollback,
						});
					setIsRestoredMode(true);
					setRestoredCwd(result.previousCwd || null);
					setRestoredCommand(result.previousCommand || null);
					return next;
				});
			}
		}
	};

	useEffect(() => {
		if (!isRestoredMode) return;

		const terminalDataRef = getOrConnectTerminal();
		if (!terminalDataRef) return;

		const timer = setTimeout(async () => {
			await ackColdRestore();
			setIsRestoredMode(false);
			setRestoredCommand(null);
			setRestoredCwd(null);
			setColdRestoreState(new Map());
		}, 10_000);

		return () => {
			clearTimeout(timer);
		};
	}, [isRestoredMode, ackColdRestore, getOrConnectTerminal]);

	return {
		coldRestoreState,
		enqueueColdRestore,
		applyColdRestore,
		isRestoredMode,
		restoredCwd,
		restoredCommand,
	};
}

/**
 * Calculate stagger delay in milliseconds based on scrollback size.
 *
 * We want cold restore to be visually synchronous for small scrollback
 * (like a hello-world app) but staggered for large scrollback (like a
 * workspace with 50k lines) so users see instant feedback per pane.
 */
function calculateStaggerDelayMS(
	position: "first" | "subsequent" | null,
	scrollback: string,
	staggerRefs: { colStagger: React.RefObject<number>; rowStagger: React.RefObject<number> },
): number {
	const lineCount = getScrollbackLines(scrollback);
	const isFirstPane = position === "first" || position === null;

	if (isFirstPane && staggerRefs.colStagger.current === 0) {
		staggerRefs.colStagger.current += COL_STAGGER_DELAY_MS;
	}

	let stagger = 0;

	if (lineCount > 5000) {
		stagger = isFirstPane
			? staggerRefs.colStagger.current
			: staggerRefs.rowStagger.current;
		staggerRefs.rowStagger.current += ROW_STAGGER_DELAY_MS;
	}

	return stagger;
}
