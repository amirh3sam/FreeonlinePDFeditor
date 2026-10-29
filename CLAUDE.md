# Project Decision Council

This repository is a **decision system, not a development system**. It contains
only the council configuration (`.claude/`), its tests (`tests/`) and saved
evaluation reports (`evaluations/`).

- Use `/evaluate <idea>` to evaluate a software, SaaS, AI, website, app or business idea.
- Never implement, scaffold, install dependencies for, deploy or hand off an evaluated idea,
  in this repository or anywhere else. A BUILD verdict is a recommendation, not authorization.
- The only output of an evaluation is a Markdown report in `evaluations/`.
- Changes to the council itself are made only when the user explicitly asks; run
  `python3 -m unittest discover -s tests` afterwards.
