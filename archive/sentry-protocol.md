# SCIT/1 protocol specification

Wire profile: `SCIT/1`
Status: specification and reference implementation. No mainnet profile exists.
Normative words: **MUST**, **MUST NOT**, **SHOULD**, and **MAY** state requirements unless a section says it is informative.

Bitcoin consensus decides whether a transaction is in the active chain. SCIT rules
decide whether that confirmed transaction is a valid organism transition. Nothing in
this document changes Bitcoin. It defines no soft fork, holds no key, and moves no
funds beyond ordinary wallet-approved spends.

## 1. What the protocol records

A Sentry is an owned identity with exactly one live control UTXO, called its carrier.
Five confirmed events create, move, update, combine, and end that carrier. Because
every event is an ordinary confirmed Bitcoin transaction, independent indexers can
derive ownership, supply, lineage, and event order without trusting any server.

Bitcoin stores a 32-byte commitment to state, never the state itself. Private memory,
model output, personal data, and prompts stay off-chain by design.

## 2. Network configuration and activation

Each network profile fixes:

```text
chain_id             32-byte Bitcoin genesis-block hash in display order
anchor_height        deeply confirmed height chosen before release
anchor_hash          block hash required at anchor_height
activation_height    future height at which SCIT/1 parsing begins
wire_version         1
base_scout_cbor      published canonical bytes
BASE_SCOUT_ROOT      root of base_scout_cbor
ZERO_PERMISSION_ROOT published empty-permission root
profile_id           tagged hash defined below
```

A future activation block hash cannot be known in advance. The anchor therefore fixes
an older block by height and hash, while activation fixes only a future height. If the
active chain no longer contains the anchor, an indexer MUST halt rather than silently
choose a new history.

The mainnet profile is intentionally absent. A zero, placeholder, or missing activation
setting activates nothing. Regtest and signet profiles are release artifacts, never
inferred defaults.

```text
profile_id = TaggedHash(
  "SCIT/network/v1",
  chain_id || u32be(anchor_height) || anchor_hash ||
  u32be(activation_height) || BASE_SCOUT_ROOT
)
```

The profile ID distinguishes different activation and anchor configurations on the same
Bitcoin-family network.

## 3. Tagged hashes and byte order

All SCIT integers are unsigned big-endian. All 32-byte IDs and hashes are read from
conventional display hexadecimal left to right. SCIT code MUST NOT apply Bitcoin Core's
internal display reversal.

```text
TaggedHash(tag, message) =
  SHA256(SHA256(UTF8(tag)) || SHA256(UTF8(tag)) || message)
```

This is the BIP 340 tagged-SHA256 construction. Tags are exact, case-sensitive ASCII
strings. The conformance fixture pins `TaggedHash("BIP0340/challenge", "")` so any
implementation can prove its construction matches BIP 340 before going further.

Registered tags:

| Tag | Use |
| --- | --- |
| `SCIT/network/v1` | Network profile ID |
| `SCIT/id/birth/v1` | Organism ID from a birth |
| `SCIT/id/fuse/v1` | Organism ID from a fusion |
| `SCIT/state/v1` | State root over canonical manifest bytes |
| `SCIT/permissions/v1` | Permission-set root |

## 4. Marker grammar

The marker MUST be output zero, have value zero, and use this exact 76-byte script:

```text
6a 4a <74-byte payload>
```

`0x6a` is `OP_RETURN`. `0x4a` is the direct 74-byte push. `PUSHDATA1`, split pushes,
trailing bytes, and alternative encodings are invalid.

| Payload offset | Size | Field | V1 rule |
| ---: | ---: | --- | --- |
| 0 | 4 | `magic` | ASCII `SCIT`, hex `53 43 49 54` |
| 4 | 1 | `version` | `0x01` |
| 5 | 1 | `event_type` | Value from the event table below |
| 6 | 2 | `flags` | `0x0000`, all bits reserved |
| 8 | 32 | `organism_id` | Nonzero ID |
| 40 | 32 | `state_root` | Nonzero root |
| 72 | 2 | `carrier_vout` | `0x0001`, or `0xffff` for retirement |

| Code | Event | Meaning |
| --- | --- | --- |
| `0x01` | `BIRTH` | Create a new Scout from no live parent |
| `0x02` | `TRANSFER` | Change owner without changing committed state |
| `0x03` | `CHECKPOINT` | Change committed state without changing owner |
| `0x04` | `FUSE` | Retire two to four parents and create one child |
| `0x05` | `RETIRE` | End one organism and return its carrier capital |

There MUST be exactly one `OP_RETURN` output in a valid SCIT transaction. Unknown
versions, unknown event types, nonzero flags, a nonzero marker value, a second
`OP_RETURN`, or a misplaced marker make the `SCIT/1` event invalid. V1 defines no
implicit forward-compatible transition. A later major version must define an explicit
migration rule.

## 5. Carrier and parent rules

A live carrier is the output explicitly named by the last valid event for an active
organism. It MUST be a 34-byte P2TR script (`OP_1 0x20 <32 bytes>`) and hold at least
1,000 sats. That value is refundable carrier capital. It is not a fee, a rank, or a
measure of power.

The reference wallet creates a key-path-only carrier policy. A P2TR output cannot prove
that no hidden script tree exists, so the overlay constrains successor spends instead.
To create a valid successor, a parent carrier MUST be spent by Taproot key path, with no
annex and exactly one witness element:

- a 64-byte `SIGHASH_DEFAULT` signature, or
- a 65-byte signature whose last byte is `0x01` (`SIGHASH_ALL`).

A script-path spend, or a key-path signature using `ANYONECANPAY`, `NONE`, or `SINGLE`,
can spend the bitcoin but cannot create a valid SCIT successor.

Before each confirmed transaction the parser derives `P`: every input that spends a
currently live SCIT carrier at that point in active-chain block and transaction order. A
valid event MUST consume exactly the event's allowed `P` and no undeclared live carrier.
Ordinary fee inputs MUST NOT be live carriers.

## 6. Stable identity derivation

Birth input zero is the identity seed.

```text
birth_seed = input[0].prevout_txid_display_bytes || u32be(input[0].prevout_vout)

organism_id = TaggedHash(
  "SCIT/id/birth/v1",
  profile_id || birth_seed || state_root || child_carrier_scriptPubKey
)
```

The seed input stays fixed across a fee replacement that intends to preserve the same
proposed identity. A different seed creates a different proposal. Identity is therefore
never bound to an unconfirmed transaction ID.

For fusion, form one tuple per parent:

```text
parent_id || parent_state_root ||
parent_prevout_txid_display_bytes || u32be(parent_prevout_vout)
```

Sort tuples by `parent_id` bytes, then derive:

```text
organism_id = TaggedHash(
  "SCIT/id/fuse/v1",
  profile_id || u8(parent_count) || concat(sorted_parent_tuples) ||
  child_state_root || child_carrier_scriptPubKey
)
```

Parent IDs MUST be unique and the parent count MUST be two to four. The first valid
confirmed claim of an ID in active-chain order owns that ID. An ID already seen as a
birth or fusion result cannot be reused. IDs carry no rarity, rank, or allocation value.

## 7. Common transaction form

A valid SCIT transaction is non-coinbase and occurs at or after activation. Native
SegWit funding inputs are the reference profile.

- In a birth, the chosen seed is input zero and inputs one onward are sorted
  lexicographically by `txid_display_bytes || u32be(vout)`.
- In a unary event, the parent is input zero and fee inputs are sorted after it.
- In a fusion, parent inputs are sorted by parent ID and fee inputs are sorted after
  them.

Output zero is the marker. Only the event-specific outputs and one optional final change
output are allowed. The optional change output MUST be nonzero and MUST NOT be an
`OP_RETURN`.

V1 allows no service-payment output inside a protocol transaction. A hosted service bills
separately. This keeps the signed lifecycle action narrow and makes `protocol fee: 0 sats`
exact.

| Event | Required inputs | Required outputs | State transition |
| --- | --- | --- | --- |
| `BIRTH` | One or more ordinary funding inputs, input zero is the identity seed, `P` is empty | `vout 0` marker, `vout 1` new P2TR carrier, optional final change | Root MUST equal `BASE_SCOUT_ROOT`, derived ID must be unseen |
| `TRANSFER` | Parent carrier at input zero plus at least one ordinary fee input, one live parent | `vout 0` marker, `vout 1` successor carrier, optional final change | ID and root equal parent, carrier value equals parent, owner script MUST change |
| `CHECKPOINT` | Parent carrier at input zero plus at least one ordinary fee input, one live parent | `vout 0` marker, `vout 1` successor carrier, optional final change | ID equals parent, root MUST change, carrier script and value equal parent |
| `FUSE` | Two to four parent carriers first, sorted by parent ID, then at least one ordinary sponsor input | `vout 0` marker, `vout 1` child carrier, refund outputs, optional sponsor change | Child ID is derived and unseen, root differs from every parent, each parent is at least 144 blocks old, child depth is at most 64, all parents retire |
| `RETIRE` | Parent carrier at input zero plus at least one ordinary fee input, one live parent | `vout 0` marker with `carrier_vout = 0xffff`, `vout 1` exact refund, optional final change | ID and root equal parent, no successor exists |

For `BIRTH`, `TRANSFER`, `CHECKPOINT`, and `FUSE`, `carrier_vout` MUST equal `0x0001`.
For `RETIRE`, it MUST equal `0xffff`.

For fusion of `n` parents, parent order is bytewise ascending parent-ID order. Outputs
`2` through `n + 1` refund each ordered parent's exact carrier value to that parent's
prior carrier script. The child carrier is funded entirely by sponsor inputs. The optional
sponsor change is output `n + 2`. No parent's carrier value ever becomes the fee, the
child reserve, or a payment to another owner.

Birth depth is zero. A fusion child's depth is one plus the maximum parent depth.
Transfer and checkpoint preserve depth. In a fusion confirmed at height `F`, each parent's
birth height `H` MUST satisfy `F - H >= 144`.

`TRANSFER` deliberately cannot alter the state root, and `CHECKPOINT` cannot alter the
owner script. A combined update requires two confirmed events. This keeps wallet intent
and indexer transitions simple.

For retirement, output one returns the parent's exact carrier value to its former carrier
script as an ordinary untracked output. It is spendable bitcoin, but it is no longer an
organism carrier.

## 8. Invalid spends and supply effects

If a confirmed transaction spends one or more live carriers but does not form a valid
SCIT successor, every spent live carrier becomes `BURNED_INVALID`. This covers a missing
marker, a malformed marker, wrong event arity, an unsafe parent sighash, an undeclared
extra carrier, a wrong output layout, and a failed state invariant.

Outputs that merely resemble carriers are never inferred as successors. Silence is not a
transition.

## 9. State manifest and restricted CBOR

The state root commits to a canonical manifest, never to the manifest's contents in the
clear.

```text
state_root = TaggedHash("SCIT/state/v1", u64be(len(canonical_cbor)) || canonical_cbor)
```

Canonical bytes MUST be between 1 and 4,096 bytes. The encoder accepts a restricted CBOR
profile only: unsigned integers, byte strings, null, arrays, and integer-keyed maps, with
shortest-form arguments, definite lengths, ascending unique map keys, and a maximum
nesting depth of 4. Indefinite lengths, text strings, tags, floats, booleans, duplicate
keys, and trailing bytes are rejected. There is exactly one valid encoding of any given
manifest, so two implementations either produce identical bytes or one has a bug.

Manifest v1 map keys:

| Key | Field | Type |
| ---: | --- | --- |
| 0 | `schemaVersion` | unsigned, MUST be 1 |
| 1 | `species` | unsigned, MUST be 1 for Scout |
| 2 | `predecessors` | array of `[organism_id, state_root]` pairs |
| 3 | `safetyKernelRoot` | 32 bytes |
| 4 | `constraintsRoot` | 32 bytes |
| 5 | `moduleSetRoot` | 32 bytes |
| 6 | `publicSkillRoot` | 32 bytes or null |
| 7 | `publicMemoryRoot` | 32 bytes or null |
| 8 | `visualRoot` | 32 bytes or null |
| 9 | `externalPermissionRoot` | 32 bytes |
| 10 | `extensions` | map of registered integer key to 32 bytes |

A birth manifest MUST have no predecessors and MUST carry the zero-permission root. A
fusion manifest MUST list its parents as predecessors in the same canonical order the ID
derivation used.

```text
ZERO_PERMISSION_ROOT = TaggedHash("SCIT/permissions/v1", 0xa0)
```

`0xa0` is the canonical encoding of the empty map. A newly born organism therefore starts
with provably zero external permission.

## 10. Indexing rules

An indexer MUST read full blocks. BIP 158 basic filters omit `OP_RETURN` scripts, so
filter-based scanning cannot find markers.

Canonical state is a function of confirmed blocks and one network profile, and nothing
else. Specifically:

- Mempool contents are never canonical. Pending proposals are tracked by spent outpoint
  and may be replaced at any time under full RBF.
- A reorg MUST be handled by applying a stored undo journal, not by re-deriving from
  current tip state.
- Block apply and undo MUST be atomic.
- Content gateways MUST NOT be consulted during canonical block application. A manifest
  that cannot be fetched is unavailable, never a different canonical answer.
- The unique live outpoint, the unique organism ID, and the rule of one current carrier
  per active organism are database invariants as well as parser rules.

Two independently authored indexers consuming the same blocks and the same profile MUST
agree on every organism ID, carrier, status, depth, lineage edge, supply counter, and
index root. Any unexplained divergence is a bug in at least one of them.

## 11. Wallet and signing boundary

The protocol defines what a valid transition looks like. It grants no software the right
to create one on a user's behalf.

- No SCIT component receives a seed, a private key, or an unattended wallet call.
- Every lifecycle action is an explicit, wallet-approved PSBTv0 packet using BIP 371
  Taproot fields.
- A model's output MUST NOT construct the transaction that a user reviews. A fixed parser
  decides protocol validity. A model may explain, never decide.
- The signed byte diff, the exact fee, the protected coins, and the resulting state change
  are shown before approval.

The reference implementation in this repository reads and writes bytes. It contains no
signer, no broadcaster, and no network client.

## 12. Reason codes

Every rejection carries a stable machine-readable code. Implementations SHOULD surface the
code alongside human text so cross-implementation disagreements are precise.

| Code | Meaning |
| --- | --- |
| `MARKER_LENGTH` | Script is not exactly 76 bytes, or is truncated |
| `MARKER_NOT_OP_RETURN` | Script does not begin with `OP_RETURN` |
| `MARKER_NON_DIRECT_PUSH` | Push opcode is not the direct 74-byte push |
| `MARKER_MAGIC` | Magic is not ASCII `SCIT` |
| `MARKER_VERSION` | Wire version is unsupported |
| `MARKER_UNKNOWN_EVENT` | Event type is not registered in V1 |
| `MARKER_RESERVED_FLAGS` | Reserved flags are nonzero |
| `MARKER_ZERO_ORGANISM_ID` | Organism ID is all zero |
| `MARKER_ZERO_STATE_ROOT` | State root is all zero |
| `MARKER_CARRIER_VOUT` | Carrier vout does not match the event |
| `INVALID_TAG` | Tagged-hash tag is empty or not printable ASCII |
| `INVALID_CARRIER_SCRIPT` | Carrier script is empty or not even-length hex |
| `INVALID_FUSION_ARITY` | Parent count is outside two to four |
| `DUPLICATE_FUSION_PARENT` | Two parents share an ID |
| `INVALID_MANIFEST_SIZE` | Canonical manifest is empty or over 4,096 bytes |
| `CBOR_SIZE` | Encoded CBOR is empty or over 4,096 bytes |
| `CBOR_TRAILING_BYTES` | Bytes remain after one complete CBOR item |

## 13. Conformance

`vectors/conformance.json` pins the marker script, the BIP 340 cross-check, the zero
permission root, and the profile, birth, and fusion identity derivations. An implementation
claiming `SCIT/1` support MUST reproduce every value byte for byte.

```
npm install && npm run build
node cli.mjs verify
```

Report a disagreement as an issue with your computed value and the exact inputs. A vector
mismatch is treated as a specification-level defect until proven otherwise.

## 14. What this version does not define

`SCIT/1` is not a token, a covenant, an inscription format, a yield product, or an
autonomous wallet. It defines no mainnet profile, no activation height, no sale, and no
supply cap beyond the arithmetic of confirmed births and retirements.

It requires no Bitcoin soft fork and does not depend on BIP 110.
