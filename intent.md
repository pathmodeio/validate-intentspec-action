---
id: "INT-VALIDATE-INTENTSPEC-ACTION-001"
status: "approved"
userGoal: "Validate an intent file in continuous integration"
objective: "Give teams a deterministic GitHub check that catches malformed IntentSpec files before they reach the main branch"
evidence:
  - type: "observation"
    source: "IntentSpec validation action README"
    excerpt: "The action validates intent.md against the IntentSpec schema and resolves evidence anchors before merge."
    anchors: ["objective", "outcome:0"]
outcomes:
  - "A workflow can validate the repository's intent.md on push or pull request"
  - "Malformed fields and unresolved evidence anchors produce a failing CI check"
constraints:
  - "The action must not require a Pathmode account or network access to validate the file"
  - "The committed dist artifact must remain synchronized with the source build"
edgeCases:
  - scenario: "An evidence anchor points to a section that does not exist"
    expectedBehavior: "The action fails with an actionable validation error"
  - scenario: "A repository uses a non-default intent file path"
    expectedBehavior: "The workflow can pass the file path through the file input"
verification:
  - "Run npm test and confirm fixtures, anchor corpus, and drift checks pass"
  - "Run npm run build and confirm the committed dist artifact has no unexpected diff"
  - "Run the action against a valid and invalid fixture and confirm the outcomes differ"
healthMetrics:
  - "The action remains compatible with the supported IntentSpec v1.x inputs"
  - "Validation failures remain understandable from the GitHub Actions log"
---
