# IntentSpec Validation Action

The official GitHub Action for [IntentSpec](https://intentspec.org) — the portable handoff format for evidence-backed AI agent intent.

Validates that your `intent.md` adheres to the [IntentSpec Schema](https://intentspec.org/schema.json). Catches malformed specs, missing required fields, and typos in evidence anchors before they reach your main branch.

This repository validates the same format it uses: [read its intent.md](intent.md).

Supports IntentSpec **v1.2**, which adds the optional `scope` and `verification` fields, requires at least one outcome, and checks that evidence anchors resolve to sections that actually exist. The last two are new failure modes, so read [Upgrading to v1.2](#upgrading-to-v12) before you bump.

## Usage

Add this to your workflow file (e.g., `.github/workflows/intentspec.yml`):

```yaml
name: Validate IntentSpec

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate Intent Spec
        uses: pathmodeio/validate-intentspec-action@v1
        with:
          file: 'intent.md' # Optional (default: intent.md)
```

## Inputs

| Input | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `file` | Path to the intent markdown file | `intent.md` | No |

## What gets validated

- **Required fields:** `id`, `status`, `objective`, `outcomes` (at least one outcome)
- **Enum constraints:** `status`, `problemSeverity`, `strategicAlignment`
- **Edge case shape:** each entry must include `scenario` and `expectedBehavior`
- **Scope shape (v1.2):** `scope.inScope` and `scope.outOfScope` must be arrays of strings
- **Evidence shape (v1.1):** each evidence item must include `type` and `excerpt`. `type` must be one of `friction`, `quote`, `observation`, `metric`, `request`.
- **Anchor format (v1.1):** evidence `anchors` must match `objective`, `userGoal`, `outcome:N`, `edgeCase:N`, `constraint:N`, or `healthMetric:N` — typos like `outomce:0` fail validation.
- **Anchor resolution (v1.2):** anchors must point at sections that exist — `outcome:3` in a two-outcome spec fails, as does anchoring `userGoal` when the spec has none.

## Why use this?

1.  **Prevent drift.** Specs without structure rot. Validation catches missing outcomes, broken edge case shapes, and typos in evidence references before they reach main.
2.  **Keep evidence honest.** Anchors that don't match a real spec section are caught at validation time — your evidence can't reference an outcome that doesn't exist.
3.  **Governance.** Make IntentSpec validation a required check on every PR.

## Versions

- `@v1` — floating tag, always points at the latest v1.x release. Use this unless you need to pin.
- `@v1.2.0` — IntentSpec v1.2 (current). Adds `scope` + `verification` fields and anchor resolution.
- `@v1.1.0` — IntentSpec v1.1. Adds evidence field validation.
- `@v1.0.8` — IntentSpec v1.0 (legacy). No evidence field validation.

### Upgrading to v1.2

v1.2 introduces no new required fields, but it does enforce two rules the written spec already stated and the validator did not check. A spec that passed under v1.1 now fails if:

- **`outcomes` is present but empty.** The spec has always said an IntentSpec MUST have at least one outcome. The schema now says it too, via `minItems: 1`.
- **An evidence anchor points at a section that does not exist.** `outcome:3` in a two-outcome spec, or `userGoal` in a spec that has no `userGoal`, was accepted before and fails now.

Both cases were already non-conformant, so this is a validator fix rather than a change to the standard. It is still a behavior change for anyone tracking `@v1`: if a spec of yours falls into either case, fix the spec, or pin `@v1.1.0` until you can.

## Development

```bash
npm ci
npm run build          # bundles src/ into dist/ via ncc, then copies the schema
npm test               # fixtures + anchor corpus + drift against intentspec.org
SKIP_DRIFT=1 npm test  # same, without the network calls
```

`dist/` is the artifact consumers actually run, so it is committed and CI rebuilds
it and fails on any diff. Build with the Node major in `.nvmrc`, or that byte
comparison will flag a difference that is only a toolchain difference.

`src/schema.json` and `test/anchors-corpus.json` are copies. The originals live on
the site and are published at `https://intentspec.org/schema.json` and
`https://intentspec.org/anchors-corpus.json`; the weekly drift job fails if a copy
here falls behind. Sync from the site, rebuild, then release.
