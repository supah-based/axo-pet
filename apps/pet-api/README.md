# Pet API

Read and transaction-preparation services for Pet NFT, Gear and marketplace extraction.

The imported modules intentionally remain disconnected from production. Their current dependencies on the AXO state repository, RPC wrapper, publisher and evidence services must be replaced with explicit interfaces before this workspace can run independently.

`src/wardrobe-read.mjs` is a new standalone read-only handler factory for GET `/api/hatchery/wardrobe`. It requires existing verified-session and coherent Pet snapshot ports and applies the shared V1 identity/equipment validators. It does not start a service, infer legacy payloads, create a ledger, or prepare transactions. See `docs/MY_AXO_WARDROBE.md` and AXO-007; production port binding remains AXO's host integration work.
