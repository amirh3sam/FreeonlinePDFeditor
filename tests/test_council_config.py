"""Static checks on the council's agent and skill configuration."""
import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENTS_DIR = os.path.join(ROOT, ".claude", "agents")
SKILL = os.path.join(ROOT, ".claude", "skills", "evaluate", "SKILL.md")
GUARD_CMD = 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/council-guard.py"'

COUNCIL = ("believer", "skeptic", "investor", "judge")
FORBIDDEN_TOOLS = {"Write", "Edit", "MultiEdit", "Bash", "Agent", "Task", "NotebookEdit"}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, flags=re.S)
    assert m, "missing YAML frontmatter"
    return m.group(1), m.group(2)


def field(fm, key):
    m = re.search(rf"^{key}:\s*(.*)$", fm, flags=re.M)
    return m.group(1).strip() if m else None


class AgentConfigTests(unittest.TestCase):
    def test_exactly_the_four_council_agents_exist(self):
        names = sorted(f[:-3] for f in os.listdir(AGENTS_DIR) if f.endswith(".md"))
        self.assertEqual(names, sorted(COUNCIL))

    def test_agent_frontmatter(self):
        for name in COUNCIL:
            with self.subTest(agent=name):
                fm, body = frontmatter(read(os.path.join(AGENTS_DIR, f"{name}.md")))
                self.assertEqual(field(fm, "name"), name)
                self.assertTrue(field(fm, "description"))
                tools = field(fm, "tools")
                # An omitted tools field would inherit every tool, including Write and Bash.
                self.assertIsNotNone(tools, "tools must be listed explicitly")
                listed = {t.strip() for t in tools.split(",") if t.strip()}
                self.assertFalse(listed & FORBIDDEN_TOOLS, f"forbidden tools: {listed & FORBIDDEN_TOOLS}")
                self.assertTrue(listed <= {"WebSearch", "WebFetch", "Read", "Glob", "Grep"})
                self.assertIn(GUARD_CMD, fm)

    def test_agents_state_boundaries_and_evidence_tags(self):
        for name in COUNCIL:
            with self.subTest(agent=name):
                body = read(os.path.join(AGENTS_DIR, f"{name}.md"))
                self.assertIn("decision system, not a development system", body)
                self.assertRegex(body, r"never write source code")
                for tag in ("[VERIFIED", "[ESTIMATE]", "[ASSUMPTION]"):
                    self.assertIn(tag, body)
                self.assertRegex(body, r"(?i)never fabricate")
                self.assertRegex(body, r"NN/100")

    def test_analysts_work_independently(self):
        for name in ("believer", "skeptic", "investor"):
            with self.subTest(agent=name):
                self.assertIn("not the other council", read(os.path.join(AGENTS_DIR, f"{name}.md")))

    def test_judge_verdicts_and_build_not_authorization(self):
        body = read(os.path.join(AGENTS_DIR, "judge.md"))
        for verdict in ("BUILD", "VALIDATE FIRST", "REJECT"):
            self.assertIn(f"**{verdict}**", body)
        self.assertIn("not** authorization to begin", body)
        self.assertIn("not an average", body)


class SkillConfigTests(unittest.TestCase):
    def setUp(self):
        self.fm, self.body = frontmatter(read(SKILL))

    def test_skill_identity_and_guard_hook(self):
        self.assertEqual(field(self.fm, "name"), "evaluate")
        self.assertIn(GUARD_CMD, self.fm)
        self.assertIsNone(field(self.fm, "allowed-tools"), "skill must not pre-approve tools")

    def test_all_phases_present(self):
        for phase in ("Phase 1 — Idea intake", "Phase 2 — Independent evaluation",
                      "Phase 3 — Judge", "Phase 4 — Final report"):
            self.assertIn(phase, self.body)

    def test_parallel_independent_dispatch(self):
        self.assertIn("single message", self.body)
        for agent in COUNCIL:
            self.assertIn(f"`{agent}`", self.body)
        self.assertIn("Do not include any\nother agent's output", self.body)

    def test_boundaries_listed(self):
        for rule in ("NEVER implement", "NEVER install dependencies", "NEVER hand the idea",
                     "NEVER treat BUILD as authorization", "NEVER modify any existing project",
                     "NEVER purchase", "NEVER send information to third parties"):
            self.assertIn(rule, self.body)

    def test_reports_go_to_evaluations_and_are_validated(self):
        self.assertIn("evaluations/<YYYY-MM-DD>-<kebab-case-title>.md", self.body)
        self.assertIn("scripts/validate_report.py", self.body)
        self.assertTrue(os.path.isdir(os.path.join(ROOT, "evaluations")))

    def test_research_config(self):
        cfg = json.loads(read(os.path.join(ROOT, ".claude", "council.json")))
        self.assertIn(cfg["research"], ("ask", "always", "never"))
        self.assertEqual(cfg["evaluations_dir"], "evaluations")


if __name__ == "__main__":
    unittest.main()
