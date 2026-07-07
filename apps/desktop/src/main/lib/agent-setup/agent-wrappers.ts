export {
	cleanupGlobalOpenCodePlugin,
	createAmpPlugin,
	createAmpWrapper,
	getAmpContent,
	isAmpManaged,
	OPENCODE_PLUGIN_MARKER,
} from "./agent-wrappers-amp";

export {
	buildClaudeSettingsMerger,
	createClaudeSettingsJson,
	createClaudeWrapper,
	getClaudeSettingsJsonContent,
} from "./agent-wrappers-claude-codex-opencode";

export {
	buildCodexWrapperExecLine,
	CODEX_EXEC_MARKER,
	CODEX_HOOKS_SIGNATURE,
	CODEX_HOOKS_VERSION,
	createCodexHooksJson,
	createCodexWrapper,
	getCodexHooksJsonContent,
} from "./agent-wrappers-claude-codex-opencode";

export {
	createDroidSettingsJson,
	createDroidWrapper,
	getDroidSettingsJsonContent,
	DROID_SETTINGS_JSON_MARKER,
} from "./agent-wrappers-droid";

export {
	createGeminiHookScript,
	createGeminiSettingsJson,
	createGeminiWrapper,
	GEMINI_HOOK_MARKER,
	GEMINI_HOOK_SCRIPT_NAME,
	getGeminiHookScriptContent,
	getGeminiHookScriptPath,
	getGeminiSettingsJsonContent,
} from "./agent-wrappers-gemini";

export {
	COPILOT_HOOK_MARKER,
	COPILOT_HOOK_SCRIPT_NAME,
	buildCopilotWrapperExecLine,
	createCopilotHookScript,
	createCopilotWrapper,
	getCopilotHookScriptContent,
	getCopilotHookScriptPath,
	getCopilotHooksJsonContent,
} from "./agent-wrappers-copilot";

export {
	createMastraHooksJson,
	createMastraWrapper,
	getMastraHooksJsonContent,
} from "./agent-wrappers-mastra";

export {
	createCursorAgentWrapper,
	createCursorHookScript,
	createCursorHooksJson,
	getCursorHookScriptContent,
} from "./agent-wrappers-cursor";

export {
	createOpenCodePlugin,
	createOpenCodeWrapper,
	getOpenCodePluginPath,
	getOpenCodePluginContent,
} from "./agent-wrappers-claude-codex-opencode";

export {
	createPiExtension,
	createPiWrapper,
	getPiExtensionContent,
	getPiExtensionPath,
	PI_EXTENSION_FILE,
	PI_EXTENSION_MARKER,
} from "./agent-wrappers-pi";
export {
	createVibeHooksToml,
	createVibeWrapper,
	getVibeHooksTomlContent,
	getVibeHooksTomlPath,
	getVibeWrapperScript,
	VIBE_HOOKS_MARKER_END,
	VIBE_HOOKS_MARKER_START,
} from "./agent-wrappers-vibe";
