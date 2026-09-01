# Preserved Sentry material

> **Frozen historical record.** Every file in this directory is a byte-identical
> copy of the file as it stood at commit
> [`4c48ff2`](https://github.com/bitcoinuniverseio/sentry/commit/4c48ff2f0d572ecbee79067eb2239a455c61f085),
> dated 10 August 2026. Nothing in here is maintained, supported, or safe to
> follow as an instruction. Read the
> [security warning](../README.md#security-warning-read-before-following-anything-here)
> first.

Sentry was archived on 26 August 2026 after its repository contents were removed
in commit `7a8c9b5`. These files are restored so the public record of the
`SCIT/1` protocol is readable without reconstructing it from Git history. They
are not restored to make the repository look active.

## Provenance and checksums

Each file is unmodified. No banner, no correction, no reformatting was applied,
so the checksums below match the blobs in this repository's Git history exactly.

| File | Source path at `4c48ff2` | SHA-256 |
| --- | --- | --- |
| `sentry-protocol.md` | `sentry-protocol.md` | `4c6468c36fff8df306781ab17355e2445705df1312c8524b67e497848745ec0d` |
| `vectors/conformance.json` | `vectors/conformance.json` | `2db5e835f0eb6564595cc671e0ebcf4365cf017918ddd8b948790e289461fafe` |
| `examples/quickstart.mjs` | `examples/quickstart.mjs` | `f9106a20d4379d959a87d6d55705aa28b4770437f02274f26730348984de549c` |
| `CHANGELOG.md` | `CHANGELOG.md` | `2fa4f5b3d9e095d97544e74f5746c08b9e584fc96840b7b02a375305f1d615f1` |
| `README-final-2026-08-10.md` | `README.md` | `5d4a8e7b98adca41679ac0364c27e506948447a080b5a858b07374e67c39175d` |
| `../LICENSE` | `LICENSE` | `51a7d46a33e097f032b3433d5b950f78222336c377e1c59d5e25b6327ec2a030` |

Verify any of them against history:

```bash
git show 4c48ff2f0d572ecbee79067eb2239a455c61f085:sentry-protocol.md | sha256sum
sha256sum archive/sentry-protocol.md
```

## What each file is

**`sentry-protocol.md`** is the normative `SCIT/1` specification in fourteen
sections: what the protocol records, network configuration and activation,
tagged hashes and byte order, the marker grammar, carrier and parent rules,
identity derivation, the common transaction form, invalid spends and supply
effects, the state manifest and its restricted CBOR profile, indexing rules, the
wallet and signing boundary, reason codes, conformance, and an explicit list of
what the version did not define. It is self-contained and was written to be
implementable without any other document.

**`vectors/conformance.json`** pins the values every implementation had to
reproduce: one `BIRTH` marker script, the network profile ID, the birth and
fusion identity derivations, the zero-permission root, and a
`TaggedHash("BIP0340/challenge", "")` cross-check that proved an implementation's
tagged-hash construction matched BIP 340 before anything else was trusted.

Two of those values can still be recomputed from the specification alone, with no
Sentry code:

```bash
node -e '
const c = require("crypto");
const th = (tag, msg) => {
  const t = c.createHash("sha256").update(tag, "utf8").digest();
  return c.createHash("sha256").update(Buffer.concat([t, t, Buffer.from(msg)])).digest("hex");
};
console.log(th("BIP0340/challenge", Buffer.alloc(0)));
console.log(th("SCIT/permissions/v1", Buffer.from([0xa0])));
'
```

That prints
`c216d352f5818b7b4beacd4ae0a26fe888080823d2a598856661bcd54f1b3713` and
`fa52f36e3698b88af6ee37e6166c91bf5e8e912a2fc337ba5267564ae4d420aa`, matching
`taggedHashEmptyChallenge` and `zeroPermissionRoot` in the fixture. The marker
script decodes to 76 bytes: `OP_RETURN`, a 74-byte push, the ASCII magic `SCIT`,
version `1`, event type, two flag bytes, a 32-byte organism ID, a 32-byte state
root, and a two-byte carrier output index. Both checks were run on 1 September
2026 and passed. The remaining three values (`profileId`, `birthId`, `fusionId`)
depend on derivations described in sections 2 and 6 of the specification and were
not recomputed here.

**`examples/quickstart.mjs`** walked a full lifecycle from birth to retirement
using local computation only, with no node, no wallet, and no network. It loads
`dist/index.js`, which no longer exists in this repository, so running it now
prints a build instruction and exits with code 2. It is preserved because it
documents the intended shape of the API, not because it runs.

**`CHANGELOG.md`** records the single release, `0.1.0`, dated 2 August 2026, and
its own status note stating that no mainnet profile existed, nothing had been
audited, and the central behavioural claim was untested.

**`README-final-2026-08-10.md`** is the public README as it stood on the final
source commit. It is the clearest surviving statement of what the project
believed it was doing and what it admitted it had not proven. Its installation
and build instructions no longer work, and one of them is unsafe: see point 1 of
the [security warning](../README.md#security-warning-read-before-following-anything-here).

## What is not preserved here

The TypeScript reference implementation (`src/`), the `sentry` command line tool
(`cli.mjs`), the Jest test suite, the build configuration, the dependency
lockfile, the CI and security workflows, and the issue and pull request templates
were removed on 26 August 2026 and are not restored. They remain reachable in
Git history:

```bash
git show 4c48ff2f0d572ecbee79067eb2239a455c61f085 --stat
git ls-tree -r --name-only 4c48ff2f0d572ecbee79067eb2239a455c61f085
```

The repository-boundary document that described the split between this public
repository and its private engineering counterpart is also not restored. It
described how the organization worked rather than how the protocol worked, and it
is not part of the specification record.

## License

MIT, as it was. See [`../LICENSE`](../LICENSE).
