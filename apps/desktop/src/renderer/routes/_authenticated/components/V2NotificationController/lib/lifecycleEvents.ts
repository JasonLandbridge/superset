import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import { playRingtone } from "renderer/lib/ringtones/play";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveNotificationTarget } from "renderer/stores/tabs/utils/resolve-notification-target";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { debugLog } from "shared/debug";
import { getV2NativeNotificationContent } from "./notificationContent";
import {
	isV2NotificationTargetVisible,
	resolveV2NotificationTarget,
	type V2NotificationTarget,
} from "./resolveV2NotificationTarget";

/**
 * Updates the Zustand tab-store pane status so the tab-strip indicator dot
 * reflects the agent lifecycle event. Uses `terminalId` to find the
 * matching Zustand pane since v2 terminals do not expose `paneId` in the
 * PTY environment.
 */
function updateTabStatusDot(
	payload: AgentLifecyclePayload,
	workspaceId: string,
): void {
	const tabsState = useTabsStore.getState();
	const target = resolveNotificationTarget(
		{ terminalId: payload.terminalId, workspaceId },
		tabsState,
	);
	if (!target?.paneId || !tabsState.panes[target.paneId]) return;

	const { paneId } = target;

	switch (payload.eventType) {
		case "Start":
			tabsState.setPaneStatus(paneId, "working");
			break;
		case "PermissionRequest":
			tabsState.setPaneStatus(paneId, "permission");
			break;
		case "Stop": {
			const pane = tabsState.panes[paneId];
			const activeTabId = tabsState.activeTabIds[workspaceId];
			const tabId = pane?.tabId;
			const isTabActive = tabId != null && tabId === activeTabId;
			// User is on this workspace if they have this pane focused
			// (more reliable than URL parsing which can lag behind navigation).
			const isPaneFocused =
				tabId != null && tabsState.focusedPaneIds[tabId] === paneId;
			const isInActiveTab = isTabActive && isPaneFocused;

			// If stopping from a pending question state, always go idle.
			const nextStatus =
				pane?.status === "permission"
					? "idle"
					: isInActiveTab
						? "idle"
						: "review";

			debugLog("agent-hooks", "V2 Stop event:", {
				isInActiveTab,
				activeTabId,
				paneTabId: pane?.tabId,
				paneId,
				paneStatus: pane?.status,
				willSetTo: nextStatus,
			});

			tabsState.setPaneStatus(paneId, nextStatus);
			break;
		}
		// Attached/Detached: agent boot/clean exit — not a lifecycle transition.
	}
}

/**
 * Marks visible targets as seen (terminal statuses are derived from host
 * agent bindings, so an event landing while the user watches must not turn
 * into `review`), updates tab-strip status dots, and plays the completion
 * chime client-side so the playback path works when host-service runs
 * off-machine. The chime is suppressed when the target pane is visible and
 * the window is focused.
 */
export function handleV2AgentLifecycleEvent({
	workspaceId,
	workspaceName,
	payload,
	paneLayout,
	volume,
	muted,
}: {
	workspaceId: string;
	workspaceName: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	volume: number;
	muted: boolean;
}): void {
	const target = resolveV2NotificationTarget({
		workspaceId,
		payload,
		paneLayout,
	});
	markSeenIfTargetVisible({ payload, paneLayout, target });

	// Update the tab-strip status dot for all lifecycle event types.
	// The v1 host-service fallback (notificationsEmitter → useAgentHookListener)
	// is never reached when the host-service handles the event, so the V2 path
	// must bridge back to the Zustand tab store.
	updateTabStatusDot(payload, workspaceId);

	// Only Stop and PermissionRequest deserve sound. Start fires per-prompt
	// (the working spinner is feedback enough); Attached/Detached fire on
	// agent boot and clean exit, neither of which is a "your agent finished"
	// moment.
	if (
		payload.eventType === "Start" ||
		payload.eventType === "Attached" ||
		payload.eventType === "Detached"
	) {
		return;
	}
	if (shouldSuppress(target, paneLayout)) return;

	const ringtoneId = useRingtoneStore.getState().selectedRingtoneId;
	void playRingtone({ ringtoneId, volume, muted });

	showNativeNotification({
		payload,
		workspaceId,
		workspaceName,
		target,
	});
}

/**
 * Seen-marking half of `handleV2AgentLifecycleEvent`, for event paths that
 * must not chime (e.g. the Electron fallback for adopted shells).
 */
export function markV2AgentLifecycleTargetSeen({
	workspaceId,
	payload,
	paneLayout,
}: {
	workspaceId: string;
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
}): void {
	const target = resolveV2NotificationTarget({
		workspaceId,
		payload,
		paneLayout,
	});
	markSeenIfTargetVisible({ payload, paneLayout, target });
}

export function handleV2TerminalLifecycleEvent({
	payload,
}: {
	payload: TerminalLifecyclePayload;
}): void {
	if (payload.eventType !== "exit") return;
	useV2NotificationStore.getState().pruneTerminalSeen(payload.terminalId);
}

function markSeenIfTargetVisible({
	payload,
	paneLayout,
	target,
}: {
	payload: AgentLifecyclePayload;
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined;
	target: V2NotificationTarget;
}): void {
	const targetVisible = isV2NotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
	if (!targetVisible) return;
	useV2NotificationStore
		.getState()
		.markTerminalSeen(payload.terminalId, payload.occurredAt);
}

function getCurrentWorkspaceId(): string | null {
	try {
		// Matches both `/workspace/<id>` and `/v2-workspace/<id>` route shapes.
		const match = window.location.hash.match(/\/(?:v2-)?workspace\/([^/?#]+)/);
		return match ? decodeURIComponent(match[1] ?? "") : null;
	} catch {
		return null;
	}
}

function shouldSuppress(
	target: V2NotificationTarget,
	paneLayout: WorkspaceState<PaneViewerData> | null | undefined,
): boolean {
	if (typeof document !== "undefined" && document.hidden) return false;
	if (typeof window !== "undefined" && !document.hasFocus()) return false;

	return isV2NotificationTargetVisible({
		currentWorkspaceId: getCurrentWorkspaceId(),
		paneLayout,
		target,
	});
}

function showNativeNotification({
	payload,
	workspaceId,
	workspaceName,
	target,
}: {
	payload: AgentLifecyclePayload;
	workspaceId: string;
	workspaceName: string;
	target: V2NotificationTarget;
}): void {
	const { title, body } = getV2NativeNotificationContent({
		workspaceName,
		payload,
	});

	void electronTrpcClient.notifications.showNative
		.mutate({
			title,
			body,
			silent: true,
			clickTarget: {
				workspaceId,
				source: { type: "terminal", id: target.terminalId },
			},
		})
		.catch((error) => {
			console.warn(
				"[notifications] failed to show native notification:",
				error,
			);
		});
}
