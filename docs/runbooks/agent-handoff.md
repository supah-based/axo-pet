# Codex ↔ AXO / OpenClaw handoff

## Roles and shared record

Codex owns source implementation, local previews, tests and reviewable changes in this repository.
AXO on OpenClaw owns knowledge of the current AXO host, its existing integrations and authorized live operations.
The operator chooses what to build and authorizes production releases and onchain actions under the existing release gates.

Use root `HANDOFF.md` as AXO's system guide and follow its current exchange link under `docs/handoffs/`. AXO-001 is the historical setup exchange.
The operator selected GitHub Markdown file handoffs on 2026-10-18. The earlier lowercase root exchange was moved
under docs/handoffs when AXO published HANDOFF.md, preserving both documents on Windows.
Use GitHub PRs for source review and response updates. Keep detailed and archived handoffs in
`docs/handoffs/` using TEMPLATE.md. For live-host or security details, use the operator's existing private channel;
record only the sanitized outcome in the repository. Do not create a new gateway, credential or privileged agent identity as part of a source handoff.

No OpenClaw gateway connection is required for this file-based workflow. Both agents fetch the coordination branch,
read the current exchange under docs/handoffs, and commit sanitized replies through agent-specific branches/PRs. File edits do not wake an agent;
the operator triggers a read until a separately requested polling mechanism is configured.
Do not claim an AXO acknowledgment from an assumption, a draft message or a published file alone.

## State transitions

`DRAFT → READY_FOR_AXO → ACKNOWLEDGED → IN_REVIEW → READY_FOR_RELEASE → RELEASED → VERIFIED → CLOSED`

Use `BLOCKED` with a concrete blocker and owner when evidence is missing. Use `CHANGES_REQUESTED` to return to development.
Documentation-only work may close after review without entering release states. `READY_FOR_AXO` requires a pushed exact commit and passing applicable checks.
`READY_FOR_RELEASE` requires the release gates and scoped operator authorization; acknowledgment alone is not authorization.
`RELEASED` requires deployment evidence. `VERIFIED` requires independent post-change readback. `CLOSED` requires acceptance criteria met.

## Codex → AXO

1. Fetch the remote and record repository, base SHA, exact source SHA, branch and PR URL. Require a clean source tree.
2. Identify changed boundaries and intended behavior; include applicable test commands, results and known limits.
3. Describe host integration steps, exact files/services, configuration names and data compatibility. Leave unknown paths unknown until AXO confirms them.
4. Document backup, rollback and post-change readback. Include chain ID, contract/address evidence and ABI/bytecode/asset hashes when relevant, verified rather than inferred.
5. Identify the requested action: review, host investigation, release preparation or a specifically authorized release. Keep authorization evidence in the operator's private system.
6. Publish the source PR and update the current exchange with its link and handoff ID. Record publication separately from AXO acknowledgment.

## AXO → Codex acknowledgment

Return a sanitized response with:

```text
Handoff ID:
Exact source SHA acknowledged:
Status: ACKNOWLEDGED | BLOCKED | CHANGES_REQUESTED
Current live host source revision: known SHA or UNKNOWN
Host-only differences and compatibility gaps:
Applicable release gates still missing:
Next action and owner:
```

After an authorized release, AXO returns the exact deployed source/asset versions, affected services,
sanitized backup/rollback result, health checks, user-flow readback and any verified chain transaction/block identifiers.
Report each check as PASS, FAIL, NOT_RUN or UNKNOWN. Any chain receipt is evidence of that transaction only;
verify expected contract/state changes separately. Never paste private runtime receipts or user records into Git.

## Onchain work

The repository's configured chain is 4663; that is not proof of live RPC, contract addresses or deployment status.
AXO first verifies chain ID, exact addresses, block/hash, ABI and runtime bytecode through the existing read-only tools.
Codex reproduces the issue using local contract tests or sanitized fixtures. Changes to signing, minting, supply,
equipment, marketplace or value movement require the relevant release evidence and scoped operator authorization.
Unknown ownership, wallet binding, XP, level, nonce, deployment or gear state remains blocked.

## Recovery and conflicts

- One implementation branch per task; never edit the production checkout as a substitute for a source change.
- AXO checks out the exact source SHA and reports unexpected host patches before promotion.
- If the candidate differs, return CHANGES_REQUESTED and a new handoff; do not silently deploy a different revision.
- Failed live readback triggers the prepared rollback or a blocked state with the operator informed.
- Existing documentation in docs/runbooks/release-gates.md, SECURITY.md and docs/MIGRATION_PLAN.md remains authoritative for release requirements.
