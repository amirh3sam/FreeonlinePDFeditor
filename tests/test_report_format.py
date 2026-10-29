"""Tests for the evaluation report validator."""
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "evaluate", "scripts"))
FIXTURES = os.path.join(ROOT, "tests", "fixtures")

import validate_report  # noqa: E402


def fixture(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
        return f.read()


class ReportValidatorTests(unittest.TestCase):
    def test_valid_report_passes(self):
        self.assertEqual(validate_report.validate(fixture("valid_report.md")), [])

    def test_invalid_report_problems_are_all_caught(self):
        problems = "\n".join(validate_report.validate(fixture("invalid_report.md")))
        self.assertIn("exactly one '**Verdict: X**'", problems)
        self.assertIn("Missing section: '## Main Risks'", problems)
        self.assertIn("Judge score 140 is outside", problems)
        self.assertIn("code block", problems)

    def test_reject_requires_change_evidence(self):
        text = fixture("valid_report.md").replace("Verdict: VALIDATE FIRST", "Verdict: REJECT")
        text = text.replace(
            "At least 5% of landing-page visitors leaving an email at the stated price "
            "would move the verdict toward BUILD.", "TBD.")
        self.assertTrue(any("REJECT verdict requires" in p for p in validate_report.validate(text)))

    def test_unknown_verdict_rejected(self):
        text = fixture("valid_report.md").replace("Verdict: VALIDATE FIRST", "Verdict: MAYBE")
        self.assertTrue(any("Invalid verdict" in p for p in validate_report.validate(text)))

    def test_three_reasons_exactly(self):
        text = fixture("valid_report.md").replace(
            "3. Differentiation versus free apps is unclear.", "")
        self.assertTrue(any("exactly 3 numbered reasons" in p for p in validate_report.validate(text)))

    def test_evidence_tags_required(self):
        text = fixture("valid_report.md")
        for tag in ("[ESTIMATE]", "[ASSUMPTION]"):
            text = text.replace(tag, "")
        self.assertTrue(any("No evidence tags" in p for p in validate_report.validate(text)))

    def test_template_placeholders_rejected(self):
        with open(os.path.join(ROOT, ".claude", "skills", "evaluate", "report-template.md")) as f:
            problems = validate_report.validate(f.read())
        self.assertTrue(any("placeholder" in p or "Invalid verdict" in p for p in problems))

    def test_template_has_every_required_section(self):
        with open(os.path.join(ROOT, ".claude", "skills", "evaluate", "report-template.md")) as f:
            secs = validate_report.sections(f.read())
        for name in validate_report.REQUIRED_SECTIONS:
            self.assertIn(name, secs)

    def test_cli_exit_codes(self):
        script = os.path.join(ROOT, ".claude", "skills", "evaluate", "scripts", "validate_report.py")
        ok = subprocess.run([sys.executable, script, os.path.join(FIXTURES, "valid_report.md")],
                            capture_output=True)
        bad = subprocess.run([sys.executable, script, os.path.join(FIXTURES, "invalid_report.md")],
                             capture_output=True)
        self.assertEqual(ok.returncode, 0)
        self.assertEqual(bad.returncode, 1)


if __name__ == "__main__":
    unittest.main()
