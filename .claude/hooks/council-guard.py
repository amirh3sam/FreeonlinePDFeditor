#!/usr/bin/env python3
"""PreToolUse guard for the Project Decision Council.

Registered by the /evaluate skill and the council agents, so it is active only
while an evaluation runs. It enforces the council's execution boundaries:

  * Write/Edit only to evaluations/*.md (the report is the only output).
  * No shell, except reading the date, listing evaluations/ and running the
    report validator.
  * Subagents limited to the four council members (no hand-off to coding agents).
  * No MCP / third-party tools; web research blocked when research is "never".
  * Anything not explicitly allowed is denied.

Exit code 2 blocks the tool call and shows stderr to Claude.
"""
import json
import os
import re
import sys

COUNCIL_AGENTS = {"believer", "skeptic", "investor", "judge"}

# Tools that cannot change anything outside the conversation.
READ_ONLY_TOOLS = {
    "Read", "Glob", "Grep", "AskUserQuestion", "ToolSearch",
    "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
}
WEB_TOOLS = {"WebSearch", "WebFetch"}
WRITE_TOOLS = {"Write", "Edit", "MultiEdit"}
AGENT_TOOLS = {"Agent", "Task"}

SAFE_ARG = r"[A-Za-z0-9._/+:%-]"
ALLOWED_BASH = [
    re.compile(rf"^date(\s+{SAFE_ARG}+)*$"),
    re.compile(r"^ls(\s+-[a-zA-Z]+)*(\s+evaluations/?)?$"),
    re.compile(
        r"^python3\s+\.claude/skills/evaluate/scripts/validate_report\.py"
        r"\s+evaluations/[A-Za-z0-9._-]+\.md$"
    ),
]


def project_dir(payload):
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return os.path.realpath(env)
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.realpath(os.path.join(here, "..", ".."))


def load_config(root):
    try:
        with open(os.path.join(root, ".claude", "council.json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def check(payload):
    """Return None to allow, or a reason string to deny."""
    tool = payload.get("tool_name", "")
    args = payload.get("tool_input") or {}
    root = project_dir(payload)
    config = load_config(root)

    if tool in READ_ONLY_TOOLS:
        return None

    if tool in WEB_TOOLS:
        if config.get("research", "ask") == "never":
            return "Web research is disabled in .claude/council.json (research: never)."
        return None

    if tool in WRITE_TOOLS:
        path = args.get("file_path", "")
        if not path:
            return "Write without a file path is not allowed."
        if not os.path.isabs(path):
            path = os.path.join(payload.get("cwd") or root, path)
        target = os.path.realpath(path)
        reports = os.path.realpath(os.path.join(root, config.get("evaluations_dir", "evaluations")))
        if os.path.dirname(target) != reports or not target.endswith(".md"):
            return (
                f"The council may only write evaluation reports (evaluations/*.md), not {path}. "
                "It never creates or modifies project files."
            )
        return None

    if tool in AGENT_TOOLS:
        agent = args.get("subagent_type", "")
        if agent not in COUNCIL_AGENTS:
            return (
                f"Subagent '{agent or 'default'}' is not a council member. The council never "
                "hands an idea to other agents; only believer, skeptic, investor and judge may run."
            )
        return None

    if tool == "Bash":
        cmd = (args.get("command") or "").strip()
        if any(p.match(cmd) for p in ALLOWED_BASH):
            return None
        return (
            "Shell commands are blocked during an evaluation (no installs, builds, git, "
            "deploys or network calls). Allowed: date, ls evaluations/, the report validator."
        )

    if tool.startswith("mcp__"):
        return f"{tool} would contact a third-party service; the council does not use MCP tools."

    return f"{tool} is not permitted during a council evaluation."


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        print("council-guard: unreadable hook input; blocking to be safe.", file=sys.stderr)
        sys.exit(2)
    reason = check(payload)
    if reason:
        print(f"Project Decision Council boundary: {reason}", file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
