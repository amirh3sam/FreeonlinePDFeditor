"""Tests for the council-guard PreToolUse hook, run as a real subprocess."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, ".claude", "hooks", "council-guard.py")


class GuardHookTests(unittest.TestCase):
    def setUp(self):
        # Isolated fake project so tests never depend on, or touch, the real repo state.
        self.project = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.project, ".claude"))
        os.makedirs(os.path.join(self.project, "evaluations"))
        self.set_research("ask")

    def tearDown(self):
        shutil.rmtree(self.project)

    def set_research(self, mode):
        with open(os.path.join(self.project, ".claude", "council.json"), "w") as f:
            json.dump({"research": mode, "evaluations_dir": "evaluations"}, f)

    def run_guard(self, tool, tool_input=None, raw=None):
        payload = raw if raw is not None else json.dumps(
            {"tool_name": tool, "tool_input": tool_input or {}, "cwd": self.project})
        env = dict(os.environ, CLAUDE_PROJECT_DIR=self.project)
        return subprocess.run([sys.executable, GUARD], input=payload, text=True,
                              capture_output=True, env=env)

    def assertAllowed(self, tool, tool_input=None):
        r = self.run_guard(tool, tool_input)
        self.assertEqual(r.returncode, 0, f"{tool} {tool_input} should be allowed: {r.stderr}")

    def assertBlocked(self, tool, tool_input=None):
        r = self.run_guard(tool, tool_input)
        self.assertEqual(r.returncode, 2, f"{tool} {tool_input} should be blocked")
        self.assertIn("Project Decision Council boundary", r.stderr)

    def report(self, name="2026-10-29-idea.md"):
        return os.path.join(self.project, "evaluations", name)

    # Writes
    def test_report_write_allowed(self):
        self.assertAllowed("Write", {"file_path": self.report()})
        self.assertAllowed("Write", {"file_path": "evaluations/x.md"})
        self.assertAllowed("Edit", {"file_path": self.report()})

    def test_project_file_writes_blocked(self):
        for path in ("src/app.js", "package.json", "evaluations/app.py",
                     "evaluations/sub/x.md", "evaluations/../README.md",
                     ".claude/agents/judge.md", "/tmp/x.md", os.path.join(self.project, "x.md")):
            with self.subTest(path=path):
                self.assertBlocked("Write", {"file_path": path})
        self.assertBlocked("Write", {})
        self.assertBlocked("NotebookEdit", {"notebook_path": "a.ipynb"})

    def test_symlink_escape_blocked(self):
        os.symlink("/tmp", os.path.join(self.project, "evaluations", "link"))
        self.assertBlocked("Write", {"file_path": "evaluations/link/x.md"})

    # Shell
    def test_safe_shell_allowed(self):
        for cmd in ("date", "date +%F", "ls evaluations", "ls -la evaluations/",
                    "python3 .claude/skills/evaluate/scripts/validate_report.py evaluations/2026-10-29-x.md"):
            with self.subTest(cmd=cmd):
                self.assertAllowed("Bash", {"command": cmd})

    def test_dangerous_shell_blocked(self):
        for cmd in ("npm install", "pip install flask", "git init", "git push origin main",
                    "npx create-react-app app", "mkdir app", "curl https://example.com",
                    "vercel deploy", "date; rm -rf /", "date && npm i", "ls src",
                    "echo x > app.js", "python3 app.py",
                    "python3 .claude/skills/evaluate/scripts/validate_report.py ../x.md"):
            with self.subTest(cmd=cmd):
                self.assertBlocked("Bash", {"command": cmd})

    # Agents
    def test_council_agents_allowed(self):
        for agent in ("believer", "skeptic", "investor", "judge"):
            self.assertAllowed("Agent", {"subagent_type": agent})

    def test_other_agents_blocked(self):
        for agent in ("general-purpose", "Plan", "claude", "fork", ""):
            with self.subTest(agent=agent):
                self.assertBlocked("Agent", {"subagent_type": agent})
        self.assertBlocked("Task", {"subagent_type": "coder"})

    # Research and third parties
    def test_web_research_follows_config(self):
        for mode in ("ask", "always"):
            self.set_research(mode)
            self.assertAllowed("WebSearch", {"query": "competitors"})
        self.set_research("never")
        self.assertBlocked("WebSearch", {"query": "competitors"})
        self.assertBlocked("WebFetch", {"url": "https://example.com"})

    def test_mcp_and_unknown_tools_blocked(self):
        for tool in ("mcp__github__create_repository", "mcp__github__push_files",
                     "Artifact", "CronCreate", "EnterWorktree", "Skill"):
            with self.subTest(tool=tool):
                self.assertBlocked(tool)

    def test_read_only_tools_allowed(self):
        for tool in ("Read", "Glob", "Grep", "AskUserQuestion", "ToolSearch"):
            self.assertAllowed(tool)

    def test_malformed_input_blocks(self):
        r = self.run_guard(None, raw="not json")
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
