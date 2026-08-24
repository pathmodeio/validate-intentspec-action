---
id: "v12-full"
status: "approved"
objective: "Ship the v1.2 surface"
outcomes:
  - "Validator and CI agree on every spec"
scope:
  inScope:
    - "Schema and action"
  outOfScope:
    - "Workspace UI"
verification:
  - "npm test in the action repo"
evidence:
  - type: "quote"
    excerpt: "The browser and CI gave me different verdicts."
    anchors: ["objective", "outcome:0"]
---
