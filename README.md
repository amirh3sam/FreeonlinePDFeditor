# Project Decision Council

A reusable Claude Code setup that evaluates software, SaaS, AI, website, app and
business ideas **before** any development and returns one verdict:

- **BUILD**: strong enough evidence to justify starting (still not authorization to start).
- **VALIDATE FIRST**: promising, but critical assumptions remain unproven.
- **REJECT**: the expected benefits do not justify the costs or risks.

The council never builds anything. Its only output is an evaluation report.

## Usage

Open Claude Code in this repository and run:

```
/evaluate A browser extension that summarizes long email threads for busy managers
```

The idea can be incomplete. The council asks questions only when something
critical is missing; otherwise it proceeds and marks its assumptions.

## How it works

| Phase | Who | What |
|---|---|---|
| 1. Intake | `/evaluate` skill | Builds an Idea Brief (problem, customers, solution, alternatives, revenue, complexity, assumptions) and asks whether web research is permitted |
| 2. Independent evaluation | `believer`, `skeptic`, `investor` | Run in parallel, each seeing only the brief |
| 3. Judgment | `judge` | Reads all three reports and gives an independent score and one verdict |
| 4. Report | `/evaluate` skill | Writes `evaluations/YYYY-MM-DD-<title>.md` and checks it with the validator |

Every claim is tagged `[VERIFIED: source]`, `[ESTIMATE]` or `[ASSUMPTION]`.
Scores (0–100) are explained judgments, not measurements.

## Safety boundaries

These are enforced in three layers:

1. **Tool allowlists.** The agents have only `WebSearch` and `WebFetch`: no file writes, shell or sub-agents.
2. **`council-guard.py` hook.** Runs while `/evaluate` or any council agent is active, and blocks:
   - writes outside `evaluations/*.md`
   - all shell commands except `date`, `ls evaluations/` and the report validator
   - any subagent other than the four council members
   - MCP and other third-party tools
   - web research when `research` is `never`
3. **Instructions** in every agent and in the skill.

## Configuration

`.claude/council.json`:

- `research`: `ask` (default, asks on each run), `always`, or `never`.
  - `never` is enforced by the hook.
  - `ask` relies on the skill's question and the brief's "Research permitted" flag.

## Files

```
.claude/agents/{believer,skeptic,investor,judge}.md   council members
.claude/skills/evaluate/SKILL.md                     /evaluate orchestration
.claude/skills/evaluate/report-template.md           report layout
.claude/skills/evaluate/scripts/validate_report.py   report validator
.claude/hooks/council-guard.py                       boundary enforcement
.claude/council.json                                 research setting
evaluations/                                         saved reports
tests/                                               config, validator and guard tests
```

## Tests

```
python3 -m unittest discover -s tests
```

Only the Python standard library is needed.
