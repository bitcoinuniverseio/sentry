import { deriveBirthOrganismId, deriveFusionOrganismId } from './scit.hash';
import {
  ScitInMemoryIndexState,
  type ScitCarrier,
  type ScitFusionTransition,
  type ScitIndexBlock,
  type ScitOrganismRecord,
} from './scit.index-state';

const PROFILE_ID = 'a1'.repeat(32);
const BASE_ROOT = 'b1'.repeat(32);

describe('SCIT/1 in-memory transition index', () => {
  it('preserves supply through a 2-parent fusion and reverses the block exactly', () => {
    const state = new ScitInMemoryIndexState({
      profileId: PROFILE_ID,
      baseScoutRoot: BASE_ROOT,
      activationHeight: 100,
      initialTip: { height: 99, hash: hashFor(99) },
    });
    const first = birthTransition(1, carrierFor(1));
    const second = birthTransition(2, carrierFor(2));
    state.applyBlock(block(100, [first, second]));
    expect(state.snapshot().counters).toMatchObject({
      lifetimeCreated: 2,
      active: 2,
      retiredByFusion: 0,
    });

    for (let height = 101; height < 244; height += 1) {
      state.applyBlock(block(height, []));
    }
    const parents = [
      state.getOrganism(first.organismId)!,
      state.getOrganism(second.organismId)!,
    ].sort((left, right) => left.organismId.localeCompare(right.organismId));
    const childCarrier = carrierFor(3);
    const childRoot = 'c1'.repeat(32);
    const childId = fusionId(parents, childRoot, childCarrier);
    const beforeFusion = state.snapshot();
    const fused = state.applyBlock(
      block(244, [
        {
          kind: 'FUSE',
          txid: txidFor(244),
          parentIds: parents.map((parent) => parent.organismId),
          organismId: childId,
          stateRoot: childRoot,
          carrier: childCarrier,
          refunds: parents.map((parent) => parent.carrier),
          sponsorInputCount: 1,
        },
      ]),
    );
    expect(fused.counters).toMatchObject({
      lifetimeCreated: 3,
      active: 1,
      retiredByFusion: 2,
      burnedInvalid: 0,
    });
    expect(state.getOrganism(childId)).toMatchObject({
      depth: 1,
      status: 'ACTIVE',
    });
    expect(state.undoLastBlock(hashFor(244))).toEqual(beforeFusion);

    state.applyBlock(
      block(244, [
        {
          kind: 'FUSE',
          txid: txidFor(244),
          parentIds: parents.map((parent) => parent.organismId),
          organismId: childId,
          stateRoot: childRoot,
          carrier: childCarrier,
          refunds: parents.map((parent) => parent.carrier),
          sponsorInputCount: 1,
        },
      ]),
    );
    const beforeBurn = state.snapshot();
    const burned = state.applyBlock(
      block(245, [
        {
          kind: 'INVALID_SPEND',
          txid: txidFor(245),
          consumedOrganismIds: [childId],
          reason: 'MARKER_NON_DIRECT_PUSH',
        },
      ]),
    );
    expect(burned.counters).toMatchObject({ active: 0, burnedInvalid: 1 });
    expect(state.getOrganism(childId)).toMatchObject({
      status: 'BURNED_INVALID',
      terminalReason: 'MARKER_NON_DIRECT_PUSH',
    });
    expect(state.undoLastBlock(hashFor(245))).toEqual(beforeBurn);
  });

  it('applies transfer, checkpoint, and explicit retirement invariants', () => {
    const state = new ScitInMemoryIndexState({
      profileId: PROFILE_ID,
      baseScoutRoot: BASE_ROOT,
      initialTip: { height: 0, hash: hashFor(0) },
    });
    const birth = birthTransition(10, carrierFor(10));
    state.applyBlock(block(1, [birth]));
    const transferredCarrier = carrierFor(11);
    state.applyBlock(
      block(2, [
        {
          kind: 'TRANSFER',
          txid: txidFor(12),
          organismId: birth.organismId,
          successorCarrier: transferredCarrier,
          feeInputCount: 1,
        },
      ]),
    );
    const checkpointRoot = 'd1'.repeat(32);
    state.applyBlock(
      block(3, [
        {
          kind: 'CHECKPOINT',
          txid: txidFor(13),
          organismId: birth.organismId,
          stateRoot: checkpointRoot,
          successorCarrier: transferredCarrier,
          feeInputCount: 1,
        },
      ]),
    );
    expect(state.getOrganism(birth.organismId)).toMatchObject({
      stateRoot: checkpointRoot,
      eventSequence: 2,
      status: 'ACTIVE',
    });
    const retired = state.applyBlock(
      block(4, [
        {
          kind: 'RETIRE',
          txid: txidFor(14),
          organismId: birth.organismId,
          refund: transferredCarrier,
          feeInputCount: 1,
        },
      ]),
    );
    expect(retired.counters).toMatchObject({
      lifetimeCreated: 1,
      active: 0,
      retiredExplicit: 1,
    });
  });

  it.each([3, 4])(
    'applies a valid %i-parent fusion with the exact supply delta',
    (parentCount) => {
      const fixture = fusionFixture(parentCount, 1);
      const snapshot = fixture.state.applyBlock(block(2, [fixture.transition]));
      expect(snapshot.counters).toMatchObject({
        lifetimeCreated: parentCount + 1,
        active: 1,
        retiredByFusion: parentCount,
        burnedInvalid: 0,
      });
      expect(
        fixture.state.getOrganism(fixture.transition.organismId),
      ).toMatchObject({
        status: 'ACTIVE',
        depth: 1,
      });
    },
  );

  it('rejects a fusion below the active-chain age boundary atomically', () => {
    const fixture = fusionFixture(2, 144);
    const before = fixture.state.snapshot();
    expect(() =>
      fixture.state.applyBlock(block(2, [fixture.transition])),
    ).toThrow('younger than the minimum active-chain age');
    expect(fixture.state.snapshot()).toEqual(before);
  });

  it('rejects noncanonical fusion parent order atomically', () => {
    const fixture = fusionFixture(3, 1);
    const before = fixture.state.snapshot();
    const transition: ScitFusionTransition = {
      ...fixture.transition,
      parentIds: [...fixture.transition.parentIds].reverse(),
      refunds: [...fixture.transition.refunds].reverse(),
    };
    expect(() => fixture.state.applyBlock(block(2, [transition]))).toThrow(
      'Fusion parent IDs must be unique and in bytewise ascending order',
    );
    expect(fixture.state.snapshot()).toEqual(before);
  });

  it('rejects a fusion that does not return an exact ordered refund', () => {
    const fixture = fusionFixture(4, 1);
    const before = fixture.state.snapshot();
    const refunds = fixture.transition.refunds.map((refund, index) =>
      index === 0 ? { ...refund, valueSats: refund.valueSats + 1 } : refund,
    );
    expect(() =>
      fixture.state.applyBlock(block(2, [{ ...fixture.transition, refunds }])),
    ).toThrow("must exactly return its ordered parent's carrier");
    expect(fixture.state.snapshot()).toEqual(before);
  });

  it('rolls back the entire block when a supplied valid transition fails', () => {
    const state = new ScitInMemoryIndexState({
      profileId: PROFILE_ID,
      baseScoutRoot: BASE_ROOT,
      initialTip: { height: 0, hash: hashFor(0) },
    });
    const birth = birthTransition(20, carrierFor(20));
    state.applyBlock(block(1, [birth]));
    const before = state.snapshot();
    expect(() =>
      state.applyBlock(
        block(2, [
          {
            kind: 'TRANSFER',
            txid: txidFor(21),
            organismId: birth.organismId,
            successorCarrier: { ...carrierFor(21), valueSats: 1001 },
            feeInputCount: 1,
          },
        ]),
      ),
    ).toThrow('TRANSFER must preserve the parent carrier value');
    expect(state.snapshot()).toEqual(before);
  });
});

function birthTransition(seed: number, carrier: ScitCarrier) {
  const seedOutpoint = { txid: hashFor(500 + seed), vout: seed };
  return {
    kind: 'BIRTH' as const,
    txid: txidFor(seed),
    organismId: deriveBirthOrganismId({
      profileId: PROFILE_ID,
      seedOutpoint,
      stateRoot: BASE_ROOT,
      carrierScriptHex: carrier.scriptHex,
    }).toString('hex'),
    stateRoot: BASE_ROOT,
    seedOutpoint,
    carrier,
    fundingInputCount: 2,
  };
}

function fusionId(
  parents: readonly ScitOrganismRecord[],
  stateRoot: string,
  carrier: ScitCarrier,
): string {
  return deriveFusionOrganismId({
    profileId: PROFILE_ID,
    parents: parents.map((parent) => ({
      parentId: parent.organismId,
      parentStateRoot: parent.stateRoot,
      parentOutpoint: parent.carrierOutpoint!,
    })),
    childStateRoot: stateRoot,
    childCarrierScriptHex: carrier.scriptHex,
  }).toString('hex');
}

function fusionFixture(
  parentCount: number,
  minimumFusionAge: number,
): {
  state: ScitInMemoryIndexState;
  transition: ScitFusionTransition;
} {
  const state = new ScitInMemoryIndexState({
    profileId: PROFILE_ID,
    baseScoutRoot: BASE_ROOT,
    minimumFusionAge,
    initialTip: { height: 0, hash: hashFor(0) },
  });
  const births = Array.from({ length: parentCount }, (_, index) =>
    birthTransition(40 + index, carrierFor(40 + index)),
  );
  state.applyBlock(block(1, births));
  const parents = births
    .map((birth) => state.getOrganism(birth.organismId)!)
    .sort((left, right) => left.organismId.localeCompare(right.organismId));
  const carrier = carrierFor(80 + parentCount);
  const stateRoot = `${(0xd0 + parentCount).toString(16)}`.repeat(32);
  return {
    state,
    transition: {
      kind: 'FUSE',
      txid: txidFor(300 + parentCount),
      parentIds: parents.map((parent) => parent.organismId),
      organismId: fusionId(parents, stateRoot, carrier),
      stateRoot,
      carrier,
      refunds: parents.map((parent) => parent.carrier),
      sponsorInputCount: 1,
    },
  };
}

function block(
  height: number,
  transitions: ScitIndexBlock['transitions'],
): ScitIndexBlock {
  return {
    height,
    hash: hashFor(height),
    previousHash: hashFor(height - 1),
    transitions,
  };
}

function carrierFor(value: number): ScitCarrier {
  return {
    scriptHex: `5120${value.toString(16).padStart(2, '0').repeat(32)}`,
    valueSats: 1000,
  };
}

function hashFor(value: number): string {
  return Math.max(0, value).toString(16).padStart(64, '0');
}

function txidFor(value: number): string {
  return (100_000 + value).toString(16).padStart(64, '0');
}
