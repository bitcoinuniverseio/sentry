# Repository boundary

Sentry lives in two repositories. This document defines the line between them. It
is identical in both, and it is the file to update when the line moves.

| Repository | Visibility | Holds |
| --- | --- | --- |
| [`bitcoinuniverse/sentry`](https://github.com/bitcoinuniverse/sentry) | Public | The `SCIT/1` specification, the reference implementation, the conformance vectors, and the public documentation |
| `bitcoinuniverse/sentry-internal` | Private | Engineering directives, service integration, operations, and everything that is not yet a public commitment |

## The one-line test

**Public if a stranger needs it to write a conforming implementation. Private if it
describes how we run ours.**

The protocol is the contract. How Bitcoin Universe operates a node, deploys a
service, staffs a team, sequences a roadmap, or responds to an incident is not part
of that contract and does not belong in the public repository.

## Public: `bitcoinuniverse/sentry`

Belongs here:

- The normative `SCIT/1` specification.
- The reference implementation of the wire format: marker codec, tagged hashes and
  identity derivation, restricted CBOR, state manifest, and the deterministic index
  state machine.
- Conformance vectors and the tooling that verifies them.
- The command line tool.
- Public documentation: what the protocol is, how to use the library, how to write
  an independent implementation, reason codes, and the honest current status.
- Contribution guidelines, code of conduct, license, and the security reporting
  policy.
- Public issue and pull request templates.

Does not belong here even though it is tempting:

- Anything that reveals infrastructure: hostnames, IP addresses, ports, service
  names, process managers, database topology, or deployment layout.
- Environment variable names that only exist in our deployment. Protocol constants
  are public. Operational flags are not.
- Internal timelines, staffing, cost estimates, or unshipped plans.
- Threat models that describe our specific systems rather than the protocol.
- Any product claim we have not yet earned. The public repository states plainly
  that there is no mainnet profile, nothing has been audited, and the central
  behavioural claim is untested. Softening that language is a boundary violation,
  not a copy edit.

## Private: `bitcoinuniverse/sentry-internal`

Belongs here:

- The full protocol blueprint, including candidate evaluation, red-team
  simulations, economics, launch gates, sign-offs, and the mainnet verdict.
- Service integration: the API module, controllers, services, runtime configuration,
  and the client feature as wired into the Bitcoin Universe platform.
- Deployment and infrastructure configuration, environment templates, and process
  definitions.
- Operational runbooks: node and indexer operation, reindex, reorg response, backup,
  incident handling, and shutdown drills.
- Internal architecture decisions, development plans, technical specifications, and
  unfinished experiments.
- Testing strategy beyond the public conformance suite, internal fixtures, and
  debugging procedures.
- Roadmap, priorities, and anything time-sensitive or not yet decided.
- Private and administrative API surfaces.

## Neither repository, ever

No secret belongs in git. Not in a public repository, not in a private one, and not
in history that was later rewritten.

This means no passwords, private keys, seed phrases, mnemonics, xprvs, API keys,
access tokens, session cookies, certificates, database credentials, or live
production values. It also means nothing captured from a real wallet or a real user.

Configuration templates carry names and shapes, never values. Every example value is
synthetic and obviously so. Real values live in the secret manager and reach a
process at runtime.

If a secret does land in a commit, treat it as compromised the moment it was
written. Rotate it at the provider first, then decide what to do about the history.
Rotation is the fix. History rewriting is cleanup, and it never comes first.

## Moving something across the line

**Private to public** is a one-way door, because anything pushed to a public
repository must be assumed permanently disclosed even if the commit is later
removed. Before promoting a file:

1. Read every line of it, not the diff.
2. Read its full history, not the current version.
3. Confirm it names no host, credential, internal path, or unshipped commitment.
4. Confirm it is required to write a conforming implementation.
5. Have someone else confirm the same thing.

**Public to private** is easy for future commits and impossible for past ones. If
something public should not have been, rotate anything it exposed and assume it was
copied.

## When a file does not obviously fit

Default to private. Moving a file into the public repository next week costs
nothing. Removing it after it has been cloned costs everything.

If you are adding something to the public repository and find yourself explaining
why it is safe, that explanation is the answer. Put it in the private repository and
open an issue proposing the promotion.
