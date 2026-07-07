import type { Terminal } from "@xterm/xterm";

/**
 * Direction constants for PTY resize.
 * Matches the values in the pty-subprocess protocol.
 */
export const TerminalResizeDirection = {
	/** Resize the columns of the PTY (horizontal resize) */
	COLS: 1,
	/** Resize the rows of the PTY (vertical resize) */
	ROWS: 2,
} as const;

export type TerminalResizeDirectionType =
	(typeof TerminalResizeDirection)[keyof typeof TerminalResizeDirection];

/** Generic stream data payload from the daemon */
export interface TerminalStreamPayload {
	data?: unknown;
	sessionId?: string;
	[Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
}

export interface TerminalStreamEvent {
	sessionId: string;
	payload: {
		type: string;
		data?: unknown;
		error?: string;
		code?: string;
		exitCode?: number;
		signal?: number;
	};
}

export type CreateOrAttachMutate = (
	input: {
		paneId: string;
		tabId: string;
		workspaceId: string;
		cols: number;
		rows: number;
		cwd?: string;
		command?: string;
		skipColdRestore?: boolean;
		allowKilled?: boolean;
	},
	options?: {
		onSuccess?: (result: CreateOrAttachResult) => void;
		onError?: (error: { message?: string }) => void;
	},
) => void;

export interface CreateOrAttachResult {
	sessionId: string;
	isColdRestore?: boolean;
	wasRecovered?: boolean;
	scrollback?: string;
	snapshot?: {
		snapshotAnsi?: string;
	};
	previousCwd?: string | null;
	/** The last command the user typed, or null if not available */
	previousCommand?: string | null;
}

export interface ColdRestoreState {
	isRestored: boolean;
	cwd: string | null;
	scrollback: string;
	command: string | null;
}

/**
 * Input parameters for createOrAttach mutation
 */
export interface CreateOrAttachInput {
	paneId: string;
	tabId: string;
	workspaceId: string;
	cols: number;
	rows: number;
	cwd?: string;
	command?: string;
	skipColdRestore?: boolean;
	allowKilled?: boolean;
}

export interface HistoryMetadata {
	/** Timestamp when this pane was last created/restarted */
	startedAt: string;
	/** Timestamp when this pane was last cleanly shutdown (null = unclean shutdown) */
	endedAt: string | null;
	/** Current working directory at time of last checkpoint */
	cwd?: string;
	/** Process command string at time of last checkpoint */
	command?: string;
	/** Terminal columns at time of last checkpoint */
	cols?: number;
	/** Terminal rows at time of last checkpoint */
	rows?: number;
}

/** Represents a terminal session from the daemon's perspective */
export interface DaemonSessionMeta {
	id: string;
	cwd: string;
	command: string;
	pid: number;
	cols: number;
	rows: number;
}

/** A snapshot of session metadata with resolved paths */
export interface SessionMeta {
	sessionId: string;
	cwd: string;
	command: string;
	priority: number;
	relativeCwd: string;
}

/** Reattach session info for the session restore overlay */
export interface ReattachSessionInfo {
	sessions: Array<{
		tabTitle: string;
		command: string;
		yieldTo: () => void;
	}>;
	preferredSessionId: string | null;
}

/** Reconnection status for the terminal overlay */
export type ReconnectionStatus = "connecting" | "reconnecting" | "connected" | "disconnected";

/** Props for the terminal container component */
export interface TerminalContainerProps {
	/** Pane identifier within a tab */
	paneId: string;
	/** Tab identifier within a workspace */
	tabId: string;
	/** Workspace identifier */
	workspaceId: string;
	/** Whether the pane is focused/active */
	isFocused?: boolean;
	/** Callback when the terminal session is ready for interaction */
	onSessionReady?: () => void;
	/** Called when the pane requests its own closure */
	onImplicitClose?: () => void;
	/** Called when the terminal process exits */
	onProcessExit?: (exitCode: number, signal?: number) => void;
	/** Called when terminal PID becomes available */
	onPidAvailable?: (pid: number) => void;
	/** Called when the terminal title changes (OSC 0/2) */
	onTitleChange?: (title: string) => void;
	/** Called when a specific session ID is requested for reattach */
	onReattachSession?: (sessionId: string) => void;
	/** Callback when a raw PID becomes available from the daemon */
	onRawPid?: (pid: number | null) => void;

	/**
	 * Minimal session info for restore UI.
	 * Passed through from the pane's session metadata.
	 *
	 * Important: only set this on the very first render, not on
	 * subsequent re-renders. Changing this prop after mount will cause
	 * the initial session to be destroyed and a new one created.
	 */
	reattachInfo?: ReattachSessionInfo;

	/**
	 * Size hints for the terminal component.
	 *
	 * Allows the parent to explicitly control the container dimensions
	 * instead of relying solely on ResizeObserver.
	 */
	sizeHints?: {
		readonly width: number;
		readonly height: number;
	};

	/** Optional callback for sending terminal data to an external consumer */
	onTerminalData?: (data: string) => void;

	/** Optional callback when the terminal is fully loaded and ready */
	onStreamReady?: () => void;

	/** Callback when user explicitly kills the process in the terminal */
	onKilledByUser?: () => void;

	/** Callback when a terminal pane resize event occurs */
	onPaneResize?: () => void;
}

/** Options for terminal scale management */
export interface TerminalScaleOptions {
	/** Whether to enable device pixel ratio scaling */
	enableDevicePixelRatio?: boolean;
	/** Custom font family to use for rendering measurements */
	fontFamily?: string;
	/** Custom font weight to use for rendering measurements */
	fontWeight?: string | number;
	/** Custom letter spacing to use for rendering measurements */
	letterSpacing?: string;
}

/** Options for terminal background image */
export interface TerminalBackgroundOptions {
	/** URL of the background image */
	backgroundImageUrl?: string;
	/** Opacity of the background image (0-1) */
	backgroundImageOpacity?: number;
}

/** Terminal state for comparison */
export interface TerminalState {
	/** Connection status for controlling overlay visibility */
	connectionStatus: ReconnectionStatus;
	/** Whether the daemon is alive and connected */
	isDaemonAlive: boolean;
	/** Whether the stream is ready to receive events */
	isStreamReady: boolean;
	/** Whether the terminal process has exited */
	isExited: boolean;
	/** Whether the terminal was killed by user */
	wasKilledByUser: boolean;
	/** Whether the terminal has focus */
	isFocused: boolean;
	/** Whether the terminal has rendered at least once */
	didFirstRender: boolean;
	/** Error message for connection failures */
	connectionError: string | null;
	/** PID of the terminal process */
	pid: number | null;
	/** Resolved dimensions of the terminal */
	dimensions: { width: number; height: number } | null;
	/** Whether the terminal pane is visible */
	isVisible: boolean;
}

/** Combined terminal pane info for external consumers */
export interface TerminalPaneInfo {
	sessionId: string | null;
	pid: number | null;
	title: string;
	isStreamReady: boolean;
	isExited: boolean;
	connectionStatus: ReconnectionStatus;
	xterm: Terminal | null;
}

/** Options for the terminal hook */
export interface UseTerminalRestoreOptions {
	/** Pane identifier within a tab */
	paneId: string;
	/** Tab identifier within a workspace */
	tabId: string;
	/** Workspace identifier */
	workspaceId: string;
}

/** Return type for the terminal restore hook */
export interface UseTerminalRestoreReturn {
	getOrConnectTerminal: () => Terminal | null;
	isExited: React.MutableRefObject<boolean>;
	wasKilledByUser: React.MutableRefObject<boolean>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isFocusedRef: React.MutableRefObject<boolean>;
	didFirstRenderRef: React.MutableRefObject<boolean>;
	pendingInitialStateRef: React.MutableRefObject<CreateOrAttachResult | null>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	createOrAttachRef: React.MutableRefObject<CreateOrAttachMutate>;
	setConnectionError: (error: string | null) => void;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	ackColdRestore: () => Promise<void>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
}
