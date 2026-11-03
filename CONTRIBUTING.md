# Contributing

Thanks for taking the time. This is a small project — a focused bug report with a repro is worth
more than a large PR.

## Reporting

- **Bug** → the *Bug report* form (it asks for the plugin build id, OS and steps).
- **A page imports wrong** → the *PPTX import fidelity issue* form; describe how the page is built
  (theme fill, group, gradient overlay, chart, ...). Attaching a minimal `.pptx` with personal
  content removed helps most.
- **Question / setup help** → [Discussions → Q&A](https://github.com/p8054076283-del/dsh-ppt-studio/discussions/categories/q-a).

Please never paste confidential deck content, names, student IDs or internal numbers into an issue.
The repository ships [`examples/demo-deck.json`](examples/demo-deck.json) — most panel bugs reproduce
with it.

## Development

```bash
node build2.mjs                      # rebuild lib/client.js from src/bundle + src/client
node scripts/selftest-client.mjs      # client bundle pre-flight
node scripts/selftest-host.mjs        # host routes
node scripts/selftest-render.mjs      # deck validation + renderer
node scripts/selftest-markdown.mjs    # markdown renderer
python scripts/selftest-import.py     # PPTX importer (+ raster path when LibreOffice/poppler exist)
```

CI runs the node suites and the python suite on every push. Please keep both green.

## Pull requests

- Keep a PR to one concern.
- If you change import behaviour, add an assertion to `scripts/selftest-import.py` — that suite is how
  fidelity regressions are caught.
- If you change the panel, note the Harness shell's `border-radius: 0 !important` rule in the main
  slot: radii need `!important` (see `forceRadius` in `src/bundle/prelude.js`).
- Screenshots in PRs must use synthetic content (the demo deck or a generated fixture).

## Commit messages

Conventional-ish (`fix:`, `feat:`, `docs:`, `chore:`) with a sentence explaining *why*.
