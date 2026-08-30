---
id: retry-failed-syncs
status: draft
---

# Retry failed evidence syncs automatically

<!-- Guidance comments must not become content. -->

## Objective

Support engineers on the integrations rota lose the first twenty minutes of every shift
reconciling overnight sync failures by hand.

## Outcomes

- [ ] A failed connector run is retried within one minute with no human touch
- [ ] Morning reconciliation drops from about twenty minutes to zero

## Constraints

- Permanent failures must never retry silently forever

## Edge Cases

- **Connector credentials expired**: retry stops after one attempt and the run is marked needs-attention

## Evidence References

- Ticket INT-4471 and its three linked duplicates

## Verification

**Fastest check**:
- [ ] Run the test suite, all green

**Manual check**:
- [ ] Force a connector failure in staging and confirm the retry fires within one minute
