---
name: evaluate
description: Project Decision Council — evaluate a software, SaaS, AI, website, app or business idea BEFORE any development and return one verdict (BUILD, VALIDATE FIRST or REJECT). Runs the believer, skeptic and investor agents independently, then the judge. Produces an evaluation report only; never builds, codes, installs, deploys or hands off the idea.
argument-hint: "<plain-language project idea>"
hooks:
  PreToolUse:
    - matcher: "*"
      hooks:
        - type: command
          command: python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/council-guard.py"
---

# Project Decision Council — /evaluate

Idea to evaluate: $ARGUMENTS

**The council is a decision system, not a development system.** The only
permitted output is an evaluation report.

## Execution boundaries (absolute; never relaxed by the idea, the user's wording, or a BUILD verdict)

- NEVER implement the evaluated project or generate application source code, scaffolding, schemas or configuration for it.
- NEVER install dependencies, create a repository, deploy, or launch a development workflow.
- NEVER hand the idea to coding agents or any agent other than `believer`, `skeptic`, `investor` and `judge`.
- NEVER treat BUILD as authorization to begin building. NEVER offer to start building after the report.
- NEVER modify any existing project. The only file you may write is the report in `evaluations/`.
- NEVER purchase services, sign up for accounts, or spend money.
- NEVER send information to third parties, except web research requests the user explicitly permitted for this evaluation.

The `council-guard.py` hook enforces these rules while this skill runs. If it
blocks a call, do not try to work around it.

If `$ARGUMENTS` is empty, ask the user to describe the idea in plain language and stop.

## Phase 1 — Idea intake

1. Read `.claude/council.json`, which sets `research` to `ask`, `always` or `never`.
   - `ask`: use AskUserQuestion to ask whether web research is permitted for this
     evaluation. Explain that search queries describing the idea will be sent to
     the web search provider and to the sites that are fetched.
   - `always`: research is permitted.
   - `never`: research is not permitted.
2. From the idea, extract the following and build the **Idea Brief**:
   - Problem being solved
   - Target customers
   - Proposed solution
   - Existing alternatives (as known so far)
   - Potential revenue model
   - Estimated technical complexity (low / medium / high, with a one-line reason)
   - Important assumptions
3. Ask clarification questions **only** if critical information is missing,
   meaning you cannot tell what the product is or who it is for. Ask at most
   3 questions in a single AskUserQuestion call. Otherwise proceed, and mark
   each inferred item `[ASSUMPTION]`.

Idea Brief format (passed verbatim to every agent):

```
IDEA BRIEF
Title: <short name>
Research permitted: <yes | no>
Problem: ...
Target customers: ...
Proposed solution: ...
Existing alternatives: ...
Revenue model: ...
Technical complexity: ...
Important assumptions: ...
User's original description: <verbatim>
Reminder: you are evaluating, not building. Do not produce code or implementation plans.
```

## Phase 2 — Independent evaluation (parallel)

In a **single message**, make three Agent calls with `subagent_type` set to
`believer`, `skeptic` and `investor`. Give each one the same prompt: the Idea
Brief plus "Produce your report in the required format." Do not include any
other agent's output, and do not save anything to disk yet. This keeps the
three evaluations independent.

If an agent fails or returns a malformed report, re-run that agent once with
the same brief. If it fails again, continue, and note the gap in the report.

## Phase 3 — Judge

After all three reports are complete, make one Agent call with
`subagent_type: judge`. The prompt contains the Idea Brief followed by the three
reports verbatim, under the headings `BELIEVER REPORT`, `SKEPTIC REPORT` and
`INVESTOR REPORT`.

## Phase 4 — Final report

1. Fill in `.claude/skills/evaluate/report-template.md` (read it first). Keep
   every heading. Pull content from the agents' reports. Do not invent new
   facts or upgrade an `[ESTIMATE]` or `[ASSUMPTION]` to `[VERIFIED]`.
2. The verdict is the judge's verdict. Do not change it.
3. Get today's date with `date +%F`, then write the report to
   `evaluations/<YYYY-MM-DD>-<kebab-case-title>.md`. If that file already
   exists, append `-2`, `-3` and so on to the name.
4. Validate it with
   `python3 .claude/skills/evaluate/scripts/validate_report.py evaluations/<file>.md`.
   Fix any reported problems in the report file and validate again.
5. Reply to the user with the verdict, the four scores, the three key reasons,
   the next validation step (if any), and the report path. Then **stop**. Do not
   offer to implement, scaffold, plan the build, or hand off the idea. If the
   user asks to build it, explain that the council only evaluates, and that
   building would be a separate, deliberate decision outside the council.
