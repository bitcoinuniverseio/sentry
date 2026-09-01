# Changelog

All notable changes to this repository are recorded here. This project follows
[Semantic Versioning](https://semver.org/). The package version and the `SCIT`
wire version move independently: the wire version changes only when the accepted
bytes change.

## [0.1.0] - 2026-08-02

First public release. Wire version `SCIT/1`.

### Added

- The normative `SCIT/1` specification in `sentry-protocol.md`, covering network
  profiles and activation, tagged hashes and byte order, the 76-byte marker
  grammar, carrier and parent rules, identity derivation for birth and fusion,
  the common transaction form for all five events, invalid spends and supply
  effects, the state manifest and restricted CBOR profile, indexing rules, the
  wallet and signing boundary, and stable reason codes.
- TypeScript reference implementation with no runtime dependency: marker codec,
  tagged hashes and identity derivation, restricted deterministic CBOR, state
  manifest encoding and validation, and the deterministic index state machine
  including undo and reorg handling.
- Conformance vectors in `vectors/conformance.json`, pinning the marker script,
  the profile, birth, and fusion identity derivations, the zero permission root,
  and a `BIP0340/challenge` cross-check that proves the tagged-hash construction
  matches BIP 340.
- The `sentry` command line tool with `decode`, `encode`, `vectors`, and `verify`.
- A runnable lifecycle example in `examples/quickstart.mjs`.
- Continuous integration across Node 20, 22, and 24, covering typecheck, build,
  unit tests, conformance vectors, command line behaviour, and examples.
- Security workflow with dependency audit, CodeQL, dependency review, and a
  boundary check that scans both the working tree and the complete git history
  for credentials and internal-only material.
- `REPOSITORY-BOUNDARY.md` defining what belongs in this public repository and
  what belongs in the private engineering repository.

### Status

There is no mainnet network profile, and none is implied by this release. The
reference implementation contains no signer, no broadcaster, and no network
client. Nothing in this repository has been externally audited, and the central
claim that a Sentry helps people refuse dangerous approvals has not yet been
tested against users.
