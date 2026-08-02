## What changes

<!-- One or two sentences. What is different after this merges. -->

## Why

<!-- The problem this solves. Link an issue if one exists. -->

## Type

- [ ] Specification wording, no behaviour change
- [ ] Specification change that alters accepted bytes
- [ ] Reference implementation fix
- [ ] New or corrected conformance vector
- [ ] Documentation
- [ ] Tooling or CI

## Compatibility

<!-- Required if accepted bytes change. What would an existing conforming
implementation do with the new bytes, and is that a break? SCIT/1 has no implicit
forward compatibility, so a byte-level change is a new wire version, not a silent
extension. Write "no byte-level change" if that is the case. -->

## Checks

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `node cli.mjs verify` reports every vector agreeing
- [ ] A vector covers any new or corrected behaviour
- [ ] No real key, seed, credential, or captured wallet data is in the diff
- [ ] Nothing here belongs in the private repository per REPOSITORY-BOUNDARY.md
