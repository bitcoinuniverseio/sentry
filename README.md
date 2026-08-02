# Sentry

**Every Bitcoin signature is a decision you cannot take back, made about a screen you
probably cannot read.**

Your wallet shows you a fee, an address, and a confirm button. Behind that button are
inputs you did not choose, outputs you cannot verify, a script you have never seen, and a
change address you are trusting on faith. Most people press confirm anyway. There is
nothing else to press.

Sentry is a protocol for putting something between you and that button. Not a company you
have to trust, and not a warning label. A thing you own, that reads the transaction with
you, remembers what you have already decided is unacceptable, and is structurally
incapable of signing anything itself.

This repository holds the specification, the reference implementation, and the conformance
vectors. It is the canonical source for `SCIT/1`.

## The idea in one minute

A Sentry is an identity you own. Bitcoin gives it exactly one live control UTXO, called a
carrier. Five confirmed transactions are its whole life:

| Event | What happens |
| --- | --- |
| `BIRTH` | A Sentry comes into existence with provably zero permissions |
| `TRANSFER` | It changes owner, and nothing else changes |
| `CHECKPOINT` | Its committed state changes, and the owner does not |
| `FUSE` | Two to four Sentries retire and one broader specialist is born |
| `RETIRE` | It ends, and its carrier capital returns in full |

Because each event is an ordinary confirmed Bitcoin transaction carrying one 74-byte
`OP_RETURN`, anyone can rebuild the entire history from blocks alone. No server decides who
owns what. No company can quietly rewrite a lineage, sell the same identity twice, or
choose which version of the past to show you.

Bitcoin holds a 32-byte commitment. It never holds your memory, your data, or a claim that
some model was right.

## Try it in sixty seconds

```bash
git clone https://github.com/bitcoinuniverse/sentry.git
cd sentry
npm install && npm run build
node cli.mjs verify
```

You should see nine vectors agree. That output is the entire trust model of this repository
in one screen: every value is recomputed from the bytes in front of you, including a
cross-check that the tagged-hash construction matches BIP 340 exactly.

Then take a marker apart:

```bash
node cli.mjs decode 6a4a5343495401010000\
1111111111111111111111111111111111111111111111111111111111111111\
2222222222222222222222222222222222222222222222222222222222222222\
0001
```

```json
{
  "version": 1,
  "eventType": "BIRTH",
  "flags": 0,
  "organismId": "1111...1111",
  "stateRoot": "2222...2222",
  "carrierVout": 1
}
```

Seventy-six bytes on chain. Nothing hidden, nothing to look up, nothing to ask permission
for.

## The rules that do not bend

Most safety products ask you to believe a promise. These are properties of the design, and
you can check every one of them in this repository today.

**It cannot sign.** There is no signer here. No seed, no private key, no wallet call, no
broadcaster, no network client. The reference implementation reads and writes bytes and
that is all it does.

**A model never decides.** A fixed parser rules on protocol validity. A model may explain
what it sees and may be wrong out loud, but its output cannot construct the transaction you
review. Untrusted text is never an authority.

**A new Sentry starts with nothing.** `ZERO_PERMISSION_ROOT` is the tagged hash of `0xa0`,
the canonical empty map. Zero permission is not a default setting somebody can flip. It is
a value you can recompute.

**Money buys nothing.** No sale price, no reserved supply, no rarity, no power bonus, no
governance weight, no yield. Mint order and purchase price grant no capability. A protocol
transaction cannot even contain a service-payment output, which is what makes `protocol
fee: 0 sats` an exact statement rather than marketing.

**Retirement returns everything.** Carrier capital is refundable in full. In a fusion,
every parent's exact value is refunded to that parent's own script. No parent's coins ever
become the fee, the child's reserve, or a payment to someone else.

**Two implementations agree or one is broken.** Canonical state is a function of confirmed
blocks and one network profile. There is exactly one valid encoding of any manifest. If
your indexer and ours disagree on a single byte, that is a bug with an address, not a
matter of interpretation.

## Where this actually is

This is a specification and a working reference implementation. It is not a launched
product, and this section is here so nobody has to guess.

**There is no mainnet profile.** Not unset, not pending, not coming soon. Absent. A zero or
placeholder activation setting activates nothing, and an indexer that loses its anchor halts
instead of picking a new history.

**The central claim is still unproven.** The premise is that a Sentry helps people refuse
dangerous approvals without drowning them in false alarms. That is a testable claim about
human behaviour, and it has not been tested yet. Until a preregistered study says otherwise,
treat it as a hypothesis with a good argument behind it.

**Nothing here has been audited.** The wallet flow, the vault, and the runtime are held to
external review before any of this touches real money. That review has not happened.

We are publishing at this stage on purpose. A protocol that plans to sit next to your
signing decisions should be readable, runnable, and breakable long before anyone has funds
at risk. Everything you need to attack the design is in this repository right now, and the
work of finding what is wrong with it is more valuable today than it will ever be again.

## What is in here

| Path | What it is |
| --- | --- |
| `sentry-protocol.md` | The normative specification. Complete enough to write a parser from. |
| `src/` | TypeScript reference implementation. |
| `src/scit.marker.ts` | The 76-byte marker codec. |
| `src/scit.hash.ts` | Tagged hashes and identity derivation. |
| `src/scit.cbor.ts` | Restricted deterministic CBOR. One valid encoding, no alternatives. |
| `src/scit.manifest.ts` | State manifest encoding, decoding, and validation. |
| `src/scit.index-state.ts` | The deterministic index state machine, including undo and reorg. |
| `vectors/conformance.json` | Conformance fixture. Every implementation must reproduce it byte for byte. |
| `cli.mjs` | The `sentry` command line tool. |
| `examples/` | Runnable examples. |

## Use it as a library

```bash
npm install @bitcoinuniverse/sentry
```

```ts
import {
  encodeScitMarker,
  decodeScitMarker,
  deriveBirthOrganismId,
} from '@bitcoinuniverse/sentry';

const script = encodeScitMarker({
  eventType: 'BIRTH',
  organismId,
  stateRoot,
});

const marker = decodeScitMarker(script);
```

Every rejection throws a `ScitProtocolError` carrying a stable `code`. The full list is in
[section 12 of the specification](sentry-protocol.md#12-reason-codes). Surface the code
next to your human-readable text so that when two implementations disagree, the
disagreement is precise.

## Writing your own implementation

The protocol is deliberately small enough to reimplement in an afternoon, and the design
depends on people doing exactly that. One implementation proves nothing. Two independently
authored implementations that agree on every byte prove something real.

1. Read [`sentry-protocol.md`](sentry-protocol.md). It is normative and self-contained.
2. Make `vectors/conformance.json` pass before writing anything else. Start with the BIP 340
   cross-check, because if your tagged hash is wrong every later value is wrong too.
3. Read full blocks. BIP 158 basic filters omit `OP_RETURN` scripts, so filter-based
   scanning will silently miss every marker.
4. Never consult a content gateway during canonical block application. A manifest you cannot
   fetch is unavailable. It is never a different answer.
5. Handle reorgs with a stored undo journal rather than re-deriving from the current tip.

If your implementation disagrees with the vectors, open an issue with your computed value
and the exact inputs. We treat a vector mismatch as a specification defect until proven
otherwise, and we would rather find it from you than from a user.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

- Specification questions and ambiguities are the most useful thing you can file. If two
  careful readers could implement a sentence differently, that sentence is a bug.
- Protocol changes need a rationale, a vector, and a compatibility statement.
- Every pull request must keep `npm test` and `node cli.mjs verify` green.
- Never commit a real key, a seed, a credential, or anything captured from a live wallet.
  Use synthetic values.

Security reports do not belong in public issues. [SECURITY.md](SECURITY.md) explains where
they go.

## Related

- [Bitcoin Universe](https://github.com/bitcoinuniverse) publishes the wider protocol family.
- [BIP 174](https://bips.dev/174/) and [BIP 371](https://bips.dev/371/) define the PSBT
  fields used by the signing flow.
- [BIP 340](https://bips.dev/340/) defines the tagged-hash construction pinned in the
  vectors.

## License

MIT. See [LICENSE](LICENSE).
