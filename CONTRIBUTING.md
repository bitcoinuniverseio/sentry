# Contributing

This repository is the canonical source for `SCIT/1`. The specification, the
reference implementation, and the conformance vectors move together, and a change
to one usually means a change to all three.

## The most valuable contribution

Ambiguity reports. If two careful readers could implement a sentence in
[`sentry-protocol.md`](sentry-protocol.md) differently, that sentence is a defect
even when the reference implementation happens to be correct. Open an issue with
the sentence, both readings, and the byte-level consequence of choosing wrong.

The second most valuable contribution is an independent implementation. One
implementation proves nothing about a protocol. Two independently authored
implementations that agree byte for byte prove something real. If yours disagrees
with `vectors/conformance.json`, that is a report we want.

## Before you open a pull request

```bash
npm install
npm run build
npm test
npm run typecheck
node cli.mjs verify
```

All five must pass. Continuous integration runs the same commands on every push
and pull request.

## Changing the protocol

A protocol change needs four things in the same pull request:

1. The specification edit, written normatively, using MUST, MUST NOT, SHOULD, and
   MAY with their standards meanings.
2. The reference implementation change.
3. A conformance vector covering the new or corrected behaviour.
4. A compatibility statement saying what an existing implementation would do with
   the new bytes, and whether that is a break.

`SCIT/1` defines no implicit forward compatibility. A change that alters accepted
bytes is a new wire version with an explicit migration rule, not a silent
extension of this one.

## Changing the vectors

Vectors are the arbiter, so they need more care than code. Never edit a vector to
make a failing implementation pass. If the implementation and the vector disagree,
decide which one the specification supports, fix that one, and say so in the pull
request. A vector change with no accompanying specification reasoning will be
declined.

## Style

Match the surrounding code. It is plain TypeScript with no framework, no runtime
dependency, and no I/O. Keep it that way. The reference implementation reads and
writes bytes, and anything that opens a socket, touches a filesystem, or reaches
for a key does not belong in `src/`.

In prose, prefer plain declarative sentences. Say what a thing does and what it
refuses to do. Avoid em dashes.

## Never commit

Real keys, seeds, mnemonics, xprvs, credentials, access tokens, or anything
captured from a live wallet or a production system. Every value in this repository
is synthetic and must stay that way. If you commit a real secret, treat it as
compromised, rotate it at the provider, and tell the maintainer. Do not attempt to
quietly rewrite history over it.

Automated secret scanning and push protection run on this repository, but they are
a backstop and not a substitute for reading your own diff.

## Reporting a vulnerability

Not in a public issue. See [SECURITY.md](SECURITY.md).

## Scope

This repository holds the protocol and its reference implementation. Deployment
configuration, infrastructure, operational runbooks, internal roadmaps, and
service integration live in a separate private repository and are deliberately not
accepted here. [REPOSITORY-BOUNDARY.md](REPOSITORY-BOUNDARY.md) explains the line
and how to tell which side a file belongs on.
