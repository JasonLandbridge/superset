import {
	buildWrapperScript,
	createWrapper,
} from "./agent-wrappers-common";

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
	const execLine = `# Reset terminal title to avoid pi inheriting stale titles from
# cold-restored scrollback (e.g. "bun dev" from a previous session).
printf '\\033]0;pi\\007' 2>/dev/null || true
if [ -n "$SUPERSET_PANE_ID" ] && find "$HOME/.pi/agent/sessions" -name "*_$SUPERSET_PANE_ID.jsonl" 2>/dev/null | grep -q .; then
  exec "$REAL_BIN" --session-id "$SUPERSET_PANE_ID" "$@"
else
  exec "$REAL_BIN" "$@"
fi`;

	const script = buildWrapperScript("pi", execLine, { agentId: "pi" });
	createWrapper("pi", script);
}


