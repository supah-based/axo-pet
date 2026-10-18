# AXO agent bootstrap message

This is a prepared message for the operator to deliver to AXO through the existing OpenClaw channel.
It has not been sent by creating this file.

---

We are developing AXO Pet from https://github.com/supah-based/axo-pet in a separate Codex workspace.
Please establish the host side of our handoff workflow. Read root handoff.md, AGENTS.md and docs/runbooks/agent-handoff.md
from the reviewed source branch when available. The initial repository baseline is
617f5599e6411dc2fa0cf5f36646cc7d022e47a8; do not treat it as a verified production revision.

Please return a sanitized acknowledgment with:

1. The exact source revision currently running axo.pet and any host-only differences, or UNKNOWN if not yet established.
2. Which services own Hatchery, wallet/session auth, Pet NFT/gear, public assets and Arena; identify the missing extraction interfaces.
3. Whether you can fetch the coordination branch and respond to root handoff.md through a branch/PR; keep gateway tokens, credentials and private runtime paths out of Git.
4. A summary of confirmed read-only chain/RPC/contract evidence and outstanding NFT/gear release gates. Do not infer deployment from repository source or UI text.
5. The integration and rollback requirements for this repository to become a standalone candidate.

The current requested action is host discovery and workflow acknowledgment. Development will happen through
feature branches and source PRs, followed by an exact-commit handoff. Production releases and onchain writes
will follow the existing scoped operator authorization and release gates. Keep live state and private evidence
on the host; return only sanitized findings.
