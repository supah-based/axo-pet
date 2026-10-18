# Release gates

A production release remains blocked unless every applicable gate is proven:

- exact reviewed source commit;
- clean required checks;
- contract ABI and runtime-bytecode review;
- immutable catalog and asset hashes;
- formal visual QA approval;
- configured exact chain and deployed-contract verification;
- sanitized state compatibility tests;
- backup and rollback evidence;
- operator authorization for deployment or migration;
- post-change readback against the exact production surface.

Missing evidence is `UNKNOWN` or `BLOCKED`, never success.
