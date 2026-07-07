import {
	cleanupGlobalOpenCodePlugin,
	createAmpPlugin,
	createAmpWrapper,
	createClaudeSettingsJson,
	createClaudeWrapper,
	createCodexHooksJson,
	createCodexWrapper,
	createCopilotHookScript,
	createCopilotWrapper,
	createCursorAgentWrapper,
	createCursorHookScript,
	createCursorHooksJson,
	createDroidSettingsJson,
	createDroidWrapper,
	createGeminiHookScript,
	createGeminiSettingsJson,
	createGeminiWrapper,
	createMastraHooksJson,
	createMastraWrapper,
	createOpenCodePlugin,
	createOpenCodeWrapper,
	createPiWrapper,
	createVibeHooksToml,
	createVibeWrapper,
} from "./agent-wrappers";
import {
	DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS,
	DESKTOP_AGENT_SETUP_TARGETS,
	type DesktopAgentSetupAction,
} from "./desktop-agent-capabilities";
import { createNotifyScript } from "./notify-hook";

const DESKTOP_AGENT_SETUP_RUNNERS: Record<DesktopAgentSetupAction, () => void> =
	{
		"notify-script": createNotifyScript,
		"cleanup-global-opencode-plugin": cleanupGlobalOpenCodePlugin,
		"amp-plugin": createAmpPlugin,
		"amp-wrapper": createAmpWrapper,
		"claude-settings-json": createClaudeSettingsJson,
		"claude-wrapper": createClaudeWrapper,
		"codex-hooks-json": createCodexHooksJson,
		"codex-wrapper": createCodexWrapper,
		"droid-wrapper": createDroidWrapper,
		"droid-settings-json": createDroidSettingsJson,
		"opencode-plugin": createOpenCodePlugin,
		"opencode-wrapper": createOpenCodeWrapper,
		"pi-extension": createPiExtension,
		"pi-wrapper": createPiWrapper,
		"cursor-hook-script": createCursorHookScript,
		"cursor-agent-wrapper": createCursorAgentWrapper,
		"cursor-hooks-json": createCursorHooksJson,
		"gemini-hook-script": createGeminiHookScript,
		"gemini-wrapper": createGeminiWrapper,
		"gemini-settings-json": createGeminiSettingsJson,
		"mastra-wrapper": createMastraWrapper,
		"mastra-hooks-json": createMastraHooksJson,
		"copilot-hook-script": createCopilotHookScript,
		"copilot-wrapper": createCopilotWrapper,
		"vibe-hooks-toml": createVibeHooksToml,
		"vibe-wrapper": createVibeWrapper,
	};

/**
 * Run a complete agent setup pass for all enabled agents.
 * Called once on app startup and again on tray-settings "Apply" save.
 */
export function setupAgentHooks(): void {
	for (const action of DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS) {
		try {
			DESKTOP_AGENT_SETUP_RUNNERS[action]();
		} catch (error) {
			console.error(`[agent-setup] Failed to run action ${action}:`, error);
		}
	}

	for (const target of DESKTOP_AGENT_SETUP_TARGETS) {
		for (const action of target.setupActions) {
			try {
				DESKTOP_AGENT_SETUP_RUNNERS[action]();
			} catch (error) {
				console.error(
					`[agent-setup] Failed to run action ${action} for ${target.id}:`,
					error,
				);
			}
		}
	}
}
