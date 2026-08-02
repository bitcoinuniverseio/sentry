# Security policy

## Scope

This repository contains a protocol specification and a byte-level reference
implementation. It has no signer, no key handling, no broadcaster, and no network
client. The highest-value findings here are therefore specification and parser
defects rather than runtime compromises.

Findings we especially want:

- A byte sequence two conforming implementations could read differently.
- An input that makes the marker, CBOR, manifest, or index state machine accept
  something the specification forbids, or reject something it permits.
- A state machine path where an invalid spend fails to burn a live carrier, or a
  valid transition is treated as invalid.
- A reorg or undo sequence that leaves canonical state different from a clean
  replay of the same blocks.
- Any way a caller could be led to believe this code validated something it did
  not.

## Supported code

Only the latest revision of `main` is supported. Release branches, feature
branches, forks, and modified copies are not supported security targets.

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected
vulnerability.

Use **Security → Report a vulnerability** on this repository to open a private
advisory. If that is unavailable to you, contact the repository owner through the
Bitcoin Universe organization profile.

Include the affected component, the impact, any prerequisites, a minimal
reproduction, and safe remediation ideas if you have them.

Never include production credentials, private keys, seed phrases, customer data,
database exports, or live exploit traffic. Use synthetic values and redact logs.
A report containing a real key will be deleted and you will be asked to resend it.

## What happens next

The maintainer validates the report privately, coordinates a fix, and publishes
disclosure details only once a fix is available. A confirmed conformance-vector
mismatch is treated as a specification-level defect and is corrected in the
specification, the implementation, and the vectors together.

## Testing boundaries

Test against regtest and signet only. There is no mainnet profile, and creating
one locally does not make it real. Do not test against production systems and do
not access data that is not your own without explicit written authorization.
