# IntentSpec Validation Action

The official GitHub Action for [IntentSpec](https://intentspec.org) — the portable handoff format for evidence-backed AI agent intent.

Validates that your `intent.md` adheres to the [IntentSpec Schema](https://intentspec.org/schema.json). Catches malformed specs, missing required fields, and typos in evidence anchors before they reach your main branch.

Supports IntentSpec **v1.1** — additively introduces an optional `evidence` field. Existing v1.0 specs continue to validate.

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
        uses: JanneL/validate-intentspec-action@v1
        with:
          file: 'intent.md' # Optional (default: intent.md)
```

## Inputs

| Input | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `file` | Path to the intent markdown file | `intent.md` | No |

## What gets validated

- **Required fields:** `id`, `status`, `objective`, `outcomes`
- **Enum constraints:** `status`, `problemSeverity`, `strategicAlignment`
- **Edge case shape:** each entry must include `scenario` and `expectedBehavior`
- **Evidence shape (v1.1):** each evidence item must include `type` and `excerpt`. `type` must be one of `friction`, `quote`, `observation`, `metric`, `request`.
- **Anchor format (v1.1):** evidence `anchors` must match `objective`, `userGoal`, `outcome:N`, `edgeCase:N`, `constraint:N`, or `healthMetric:N` — typos like `outomce:0` fail validation.

## Why use this?

1.  **Prevent drift.** Specs without structure rot. Validation catches missing outcomes, broken edge case shapes, and typos in evidence references before they reach main.
2.  **Keep evidence honest.** Anchors that don't match a real spec section are caught at validation time — your evidence can't reference an outcome that doesn't exist.
3.  **Governance.** Make IntentSpec validation a required check on every PR.

## Versions

- `@v1` — floating tag, always points at the latest v1.x release. Use this unless you need to pin.
- `@v1.1.0` — IntentSpec v1.1 (current). Adds evidence field validation.
- `@v1.0.8` — IntentSpec v1.0 (legacy). No evidence field validation.

IntentSpec follows semver. Minor bumps are additive — v1.0 specs validate cleanly against v1.1.
