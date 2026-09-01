# Sentry (archived)

> ## ARCHIVED. FROZEN. NOT MAINTAINED.
>
> **Archived:** 26 August 2026
> **Final version:** `0.1.0`, wire profile `SCIT/1`. Never released to Bitcoin mainnet.
> **Final source commit:** [`4c48ff2`](https://github.com/bitcoinuniverseio/sentry/commit/4c48ff2f0d572ecbee79067eb2239a455c61f085) (10 August 2026)
> **Replacement:** none. Sentry was retired without a successor.
>
> This repository receives no changes, no fixes, no security patches, and no
> support. It exists as a permanent public record of a protocol Bitcoin Universe
> designed and then retired. Nothing here is a live product, a supported library,
> or a specification you should build against.
>
> Read the [security warning](#security-warning-read-before-following-anything-here) before you follow any instruction preserved in this repository.

## What Sentry was

Sentry was a Bitcoin protocol designed to sit between a person and a signing
decision. The idea: give a user an identity, recorded on Bitcoin, that reads a
proposed transaction alongside them, remembers what they have already declared
unacceptable, and is structurally incapable of signing anything itself.

The on-chain part was deliberately small. A Sentry had exactly one live control
output, called a carrier. Five confirmed Bitcoin transactions covered its whole
life:

| Event | What it did |
| --- | --- |
| `BIRTH` | Brought a Sentry into existence with provably zero permissions |
| `TRANSFER` | Changed its owner, and nothing else |
| `CHECKPOINT` | Changed its committed state, with the owner unchanged |
| `FUSE` | Retired two to four Sentries and created one broader successor |
| `RETIRE` | Ended it and returned the carrier capital in full |

Each event was an ordinary Bitcoin transaction carrying one 74-byte `OP_RETURN`
payload inside a 76-byte output script. Bitcoin held a 32-byte commitment to
state and never the state itself, so any indexer reading full blocks could
rebuild ownership, supply, lineage, and event order without trusting a server.

The wire format was named `SCIT/1`. The [preserved specification](archive/sentry-protocol.md)
is complete enough to write a parser from, and it is still the best description
of what Sentry was.

## What Sentry was not

This matters more than usual, because the repository was published while the
work was still unproven and the published README said so in plain terms.

- **There was never a mainnet profile.** Not unset, not pending. Absent by
  design. Activation required a network profile fixing an anchor height, an
  anchor hash, and a future activation height, and no such profile was ever
  published for Bitcoin mainnet.
- **Nothing was audited.** No external review of the design, the reference
  implementation, or any signing flow ever took place.
- **The central claim was never tested.** The premise was that a Sentry helps
  people refuse dangerous approvals without drowning them in false alarms. That
  is a testable claim about human behaviour. It was never tested.
- **There was no signer.** The reference implementation held no key, no seed, no
  wallet call, no broadcaster, and no network client. It read and wrote bytes.
- **It was never published to a package registry.** See the security warning.

## Why it was archived

Sentry did not reach a public release, and the work was retired rather than
shipped. On 26 August 2026 the repository contents were removed in commit
[`7a8c9b5`](https://github.com/bitcoinuniverseio/sentry/commit/7a8c9b5e42b41d69431616275fe409339828e9ef)
and the repository was archived. This README and the [`archive/`](archive/)
directory restore the historically valuable public material so the record is
readable without digging through Git history.

The Bitcoin Universe documentation portal publishes no Sentry page. There is no
`SCIT/1` entry in the protocol atlas, because Sentry never became a protocol the
organization ships or indexes.

## What replaced it

Nothing. No Bitcoin Universe protocol inherited Sentry's design, its identity
model, or its wire format. Statements to the contrary are wrong.

If you arrived here looking for a Bitcoin protocol Bitcoin Universe actually
ships, indexes, or documents, the
[Protocol Atlas](https://docs.bitcoinuniverse.io/protocols/) lists every one of
them and points at the specification that owns each.

## Migration guidance

There is nothing to migrate to and nothing to migrate from, because no released
software depended on Sentry.

- **If you built against `SCIT/1`:** you were building against an unreleased
  specification with no mainnet profile. Stop. There is no network to index and
  no supported implementation to track.
- **If you have a dependency on `@bitcoinuniverse/sentry`:** remove it. That
  package was never published. See the security warning.
- **If you want a Bitcoin protocol with a real specification, vectors, and an
  indexer:** start at the [Protocol Atlas](https://docs.bitcoinuniverse.io/protocols/).
- **If you want the design ideas:** the [specification](archive/sentry-protocol.md)
  is MIT licensed. Reuse it, fork it, or improve on it. Do not present a fork as
  a Bitcoin Universe product.

## Security warning: read before following anything here

The preserved material was written while the repository was active. Some of its
instructions are unsafe or misleading to follow today.

1. **Do not run `npm install @bitcoinuniverse/sentry`.** The preserved final
   README told readers to install that package. It was never published: the npm
   registry returns HTTP 404 for `@bitcoinuniverse/sentry` as of 1 September
   2026, and the `@bitcoinuniverse` scope is not held by this organization.
   Installing that name now would install whatever a stranger later publishes
   under it. Treat any package by that name as untrusted.
2. **Do not run the preserved build and verification commands.** The reference
   implementation, its `package.json`, its lockfile, and its CI were removed
   from this repository. `npm install && npm run build`, `npm test`, and
   `node cli.mjs verify` cannot work here, and
   [`archive/examples/quickstart.mjs`](archive/examples/quickstart.mjs) exits
   with code 2 because there is no build to load.
3. **Do not treat `SCIT/1` as a live specification.** It defines no mainnet
   activation, it was never audited, and it will never receive a correction. A
   defect found in it today will not be fixed.
4. **Report nothing here as a vulnerability against a live system.** This code
   runs nowhere. If you find a flaw that also affects a Bitcoin Universe product
   that is still running, report that product privately using the organization's
   [security policy](https://github.com/bitcoinuniverseio/.github/blob/main/SECURITY.md).

The preserved documents also point at `github.com/bitcoinuniverse/...`. The
organization was later renamed to `bitcoinuniverseio`, and GitHub still redirects
those URLs, so they resolve. The npm scope did not move with it, which is exactly
why point 1 matters.

## What is preserved here

Everything in [`archive/`](archive/) is a byte-identical copy of the file as it
stood at commit `4c48ff2`, the last commit that carried the protocol material.
Checksums are recorded in [`archive/README.md`](archive/README.md) so any copy
can be checked against Git history.

| Path | What it is |
| --- | --- |
| [`archive/sentry-protocol.md`](archive/sentry-protocol.md) | The normative `SCIT/1` specification, 14 sections |
| [`archive/vectors/conformance.json`](archive/vectors/conformance.json) | Conformance fixture: marker script, profile, birth and fusion identities, zero-permission root, BIP 340 cross-check |
| [`archive/examples/quickstart.mjs`](archive/examples/quickstart.mjs) | The lifecycle example, preserved as written and no longer runnable |
| [`archive/CHANGELOG.md`](archive/CHANGELOG.md) | The `0.1.0` release record |
| [`archive/README-final-2026-08-10.md`](archive/README-final-2026-08-10.md) | The README as published on the final source commit |
| [`LICENSE`](LICENSE) | MIT, restored so the preserved material carries its license |

The TypeScript reference implementation, the command line tool, the test suite,
and the CI workflows were removed on 26 August 2026 and are not restored here.
They remain reachable in this repository's Git history at commit `4c48ff2`.

## Permanent URLs

These are stable and are expected to keep resolving.

| What | URL |
| --- | --- |
| This repository | https://github.com/bitcoinuniverseio/sentry |
| Preserved specification | https://github.com/bitcoinuniverseio/sentry/blob/main/archive/sentry-protocol.md |
| Final source commit | https://github.com/bitcoinuniverseio/sentry/commit/4c48ff2f0d572ecbee79067eb2239a455c61f085 |
| Content-removal commit | https://github.com/bitcoinuniverseio/sentry/commit/7a8c9b5e42b41d69431616275fe409339828e9ef |
| Protocol Atlas (what we do ship) | https://docs.bitcoinuniverse.io/protocols/ |
| Documentation home | https://docs.bitcoinuniverse.io |
| Lifecycle vocabulary | https://docs.bitcoinuniverse.io/status/ |

## License

MIT. See [LICENSE](LICENSE). The license applies to the preserved material and
survives archival.
