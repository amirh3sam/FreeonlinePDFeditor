#!/usr/bin/env python3
"""Validate a Project Decision Council evaluation report.

Usage: python3 validate_report.py <report.md>
Exit 0 if valid, 1 with a list of problems otherwise.
"""
import re
import sys

VERDICTS = ("BUILD", "VALIDATE FIRST", "REJECT")

REQUIRED_SECTIONS = [
    "Verdict",
    "Executive Summary",
    "Idea Brief",
    "Scores",
    "Believer — Opportunity Findings",
    "Skeptic — Risk Findings",
    "Investor — Business Findings",
    "Competitors and Differentiation",
    "Estimated Costs and Timeline",
    "Main Risks",
    "Judge's Assessment",
    "Three Key Reasons for the Decision",
    "Recommended Next Validation Step",
    "What Would Change This Decision",
    "Sources",
]

SCORED_AGENTS = ("Believer", "Skeptic", "Investor", "Judge")
EVIDENCE_TAG = re.compile(r"\[(VERIFIED:[^\]]+|ESTIMATE|ASSUMPTION)\]")
PLACEHOLDER = re.compile(r"<[A-Z][^>\n]*>|\bNN/100\b")


def sections(text):
    """Map '## Heading' -> body text."""
    out = {}
    parts = re.split(r"^## +(.+?)\s*$", text, flags=re.M)
    for i in range(1, len(parts), 2):
        out[parts[i].strip()] = parts[i + 1].strip()
    return out


def validate(text):
    problems = []
    secs = sections(text)

    if not re.match(r"^# Project Decision Council — \S", text):
        problems.append("Missing title line '# Project Decision Council — <title>'.")

    for name in REQUIRED_SECTIONS:
        if name not in secs:
            problems.append(f"Missing section: '## {name}'.")
        elif not secs[name]:
            problems.append(f"Section '## {name}' is empty.")

    verdict_lines = re.findall(r"\*\*Verdict:\s*([^*\n]+?)\s*\*\*", text)
    verdict = None
    if len(verdict_lines) != 1:
        problems.append(f"Expected exactly one '**Verdict: X**' line, found {len(verdict_lines)}.")
    elif verdict_lines[0] not in VERDICTS:
        problems.append(f"Invalid verdict '{verdict_lines[0]}'; must be one of {', '.join(VERDICTS)}.")
    else:
        verdict = verdict_lines[0]

    scores = secs.get("Scores", "")
    for agent in SCORED_AGENTS:
        m = re.search(rf"^\|\s*{agent}\s*\|[^\n]*?\|\s*(\d{{1,3}})\s*/\s*100\s*\|", scores, flags=re.M)
        if not m:
            problems.append(f"Scores table has no 'NN/100' score for {agent}.")
        elif not 0 <= int(m.group(1)) <= 100:
            problems.append(f"{agent} score {m.group(1)} is outside 0–100.")

    reasons = secs.get("Three Key Reasons for the Decision", "")
    n_reasons = len(re.findall(r"^\s*\d+\.\s+\S", reasons, flags=re.M))
    if reasons and n_reasons != 3:
        problems.append(f"'Three Key Reasons' must list exactly 3 numbered reasons, found {n_reasons}.")

    if verdict == "REJECT" and len(secs.get("What Would Change This Decision", "")) < 40:
        problems.append("REJECT verdict requires a substantive 'What Would Change This Decision' section.")

    if verdict in ("VALIDATE FIRST", "REJECT") and secs.get(
        "Recommended Next Validation Step", ""
    ).lower().startswith("none"):
        problems.append(f"{verdict} verdict requires a concrete next validation step.")

    # The evidence legend line shows example tags; it is not evidence itself.
    body = re.sub(r"^.*\*\*Evidence legend:\*\*.*$", "", text, flags=re.M)
    if not EVIDENCE_TAG.search(body):
        problems.append("No evidence tags found ([VERIFIED: source], [ESTIMATE], [ASSUMPTION]).")

    if "```" in text:
        problems.append("Report contains a code block; the council must not produce code for the evaluated project.")

    if PLACEHOLDER.search(text):
        problems.append(f"Unfilled template placeholder: '{PLACEHOLDER.search(text).group(0)}'.")

    return problems


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        problems = validate(f.read())
    if problems:
        print(f"INVALID: {argv[1]}")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"VALID: {argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
