import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const PI_EXTENSION_FILE = "superset-hooks.ts";

const PI_EXTENSION_SIGNATURE = "// Superset pi extension";
const PI_EXTENSION_VERSION = "v2";
export const PI_EXTENSION_MARKER = `${PI_EXTENSION_SIGNATURE} ${PI_EXTENSION_VERSION}`;

const PI_EXTENSION_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"pi-extension.template.ts",
);

export function getPiExtensionPath(): string {
	return path.join(
		os.homedir(),
		".pi",
		"agent",
		"extensions",
		PI_EXTENSION_FILE,
	);
}

export function getPiExtensionContent(): string {
	const template = fs.readFileSync(PI_EXTENSION_TEMPLATE_PATH, "utf-8");
	return template.replaceAll("{{MARKER}}", PI_EXTENSION_MARKER);
}

export function createPiExtension(): void {
	const extensionPath = getPiExtensionPath();
	const dir = path.dirname(extensionPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const content = getPiExtensionContent();
	const changed = writeFileIfChanged(extensionPath, content, 0o644);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} pi extension`);
}

/**
 * Creates a pi wrapper at ~/.superset/bin/pi that passes
 * --session-id $SUPERSET_PANE_ID so pi sessions are restored
 * across cold starts — but only when an existing session is found.
 * For new terminals, pi starts clean (no --session-id).
 */
export function createPiWrapper(): void {
	// Only pass --session-id when an existing pi session for this pane exists.
	// Pi stores sessions in ~/.pi/agent/sessions/<project>/<timestamp>_<id>.jsonl.
	// Searching all subdirs avoids needing to know the current project at wrapper time.
	const execLine = `# Clear stale scrollback and reset title so pi's TUI renders
# on a clean canvas (cold-restored sessions carry previous commands).
printf '\\033[2J\\033[H' 2>/dev/null || true
printf '\\033]0;pi\\007' 2>/dev/null || true
if [ -n "$SUPERSET_PANE_ID" ] && find "$HOME/.pi/agent/sessions" -name "*_$SUPERSET_PANE_ID.jsonl" 2>/dev/null | grep -q .; then
  exec "$REAL_BIN" --session-id "$SUPERSET_PANE_ID" "$@"
else
  exec "$REAL_BIN" "$@"
fi`;

	const script = buildWrapperScript("pi", execLine, { agentId: "pi" });
	createWrapper("pi", script);
}
