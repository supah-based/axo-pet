# AXO Pet shared handoff

This file is the shared inbox/outbox between Codex (development) and AXO on OpenClaw (host integration).
The operator selected GitHub file handoffs on 2026-10-18. Both agents fetch the repository before reading it.
Keep updates sanitized; live state, secrets, private receipts and authorization evidence stay outside Git.

## Current exchange

- ID: AXO-001
- Status: READY_FOR_AXO
- Next owner: AXO on OpenClaw
- Branch: `codex/axo-development-workflow`
- Source review: https://github.com/supah-based/axo-pet/pull/4 (draft)
- Repository baseline: `617f5599e6411dc2fa0cf5f36646cc7d022e47a8`
- Exact implementation source SHA: `ab2bbacaba7bdb94a38c7f5d7d8d6c0e0ce67e59`
- Request revision: resolve `git log -1 --format=%H -- handoff.md` before editing and report that full SHA with the implementation SHA below.
- Requested action: host discovery and workflow acknowledgment
- Delivery: GitHub branch publication; AXO acknowledgment pending
- Production release: not requested by this exchange

## Codex → AXO

The repository has been cloned into a separate development checkout. We added a local source preview on
port 4320, a memory-only synthetic Arena, a disconnected local wallet adapter, required preview tests,
development instructions and an exact-commit handoff runbook.

The repo is an extraction workspace. The full `/hatchery` dashboard, wallet/session bootstrap,
shared shell, public asset universe and host API/state/RPC interfaces are not all packaged here.
The preview renders existing source pages and uses fixed-origin public image/style reads where assets are absent.
Hatchery APIs stay unavailable; real Pet, XP, wallet, NFT, gear and Epoch state are not mocked as authoritative.

Please respond in the AXO → Codex section with:

1. The exact requested source SHA acknowledged and the current live axo.pet host source revision, or UNKNOWN if not yet established.
2. Which existing services own Hatchery, wallet/session auth, Pet NFT/gear, public assets and Arena, and which extraction interfaces are missing.
3. Whether you can fetch and update this repository through a branch/PR. Propose the smallest first read-only Pet/Passport adapter task.
4. A sanitized summary of confirmed chain ID, exact contract deployment evidence and missing NFT/gear release gates. Repository configuration expects chain 4663; verify actual live evidence independently.
5. Required host integration, backup, rollback and readback steps before a future release.

The current request is discovery and acknowledgment. Follow docs/runbooks/agent-handoff.md and the existing release gates for subsequent implementation and releases.

## Codex verification

| Check | Result |
| --- | --- |
| Repository verification | PASS |
| Repository tests | PASS — 3 |
| Contract tests, local simulation | PASS — 35 |
| Arena standalone tests | PASS — 73 |
| Source preview boundary tests | PASS — 3 |
| Solidity compile / lint | PASS — 0 lint errors; 302 warnings on the unmodified contracts in the Windows workspace |
| Browser | Local home rendered; synthetic Pet entered Arena lobby; live axo.pet homepage rendered |
| Authenticated live Pet / onchain writes | NOT_RUN |
| Production source parity | UNKNOWN |

GitHub reported 13 dependency alerts on the default branch when this branch was pushed
(8 high, 4 moderate, 1 low). These are an inherited, untriaged baseline and are not a security assessment
of this change. Review affected dependency paths before a production release; no dependency versions were changed here.

## AXO → Codex

- Exact request source SHA acknowledged: UNKNOWN
- Status: NOT_ACKNOWLEDGED
- Live host source revision: UNKNOWN
- Host-only changes and extraction gaps: UNKNOWN
- Confirmed read-only chain/contract evidence: UNKNOWN
- Proposed next task and owner: awaiting AXO
- Release gates / integration / rollback findings: awaiting AXO
- Response branch / PR: pending

## Updating this file

1. Fetch `origin`; read this exchange on the named branch or its merged successor. Record the request SHA before editing.
2. Work from that exact source revision on an agent-specific branch. Preserve the other agent's text and append a dated response with the exchange ID.
3. Commit and push the response, open a PR to the coordination branch (or main after the setup is merged), and return its link through the operator's existing channel. Do not force-push or silently resolve a competing exchange.
4. The receiving agent fetches and acknowledges the response's full SHA before starting dependent work.
5. For a new request, increment the exchange ID and preserve the completed exchange under docs/handoffs/ before replacing the current sections.

This is a pull-based shared record. Neither agent is automatically awakened or notified by a file edit.
The operator can tell either agent to read the latest handoff; scheduled polling can be added if requested.
