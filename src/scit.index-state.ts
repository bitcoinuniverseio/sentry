import {
  bytes32FromHex,
  bytesFromHex,
  compareHexBytes,
  isZeroBytes,
} from './scit.bytes';
import { scitAssert } from './scit.errors';
import {
  deriveBirthOrganismId,
  deriveFusionOrganismId,
  type ScitFusionParentIdentityInput,
} from './scit.hash';

export type ScitOrganismStatus =
  | 'ACTIVE'
  | 'RETIRED_EXPLICIT'
  | 'RETIRED_BY_FUSION'
  | 'BURNED_INVALID';

export interface ScitOutpoint {
  txid: string;
  vout: number;
}

export interface ScitCarrier {
  scriptHex: string;
  valueSats: number;
}

export interface ScitOrganismRecord {
  organismId: string;
  stateRoot: string;
  carrier: ScitCarrier;
  carrierOutpoint: ScitOutpoint | null;
  birthHeight: number;
  depth: number;
  eventSequence: number;
  status: ScitOrganismStatus;
  createdBy: 'BIRTH' | 'FUSE';
  lastTxid: string;
  terminalReason: string | null;
}

export interface ScitSupplyCounters {
  lifetimeCreated: number;
  active: number;
  retiredExplicit: number;
  retiredByFusion: number;
  burnedInvalid: number;
  validEvents: number;
  invalidSpendTransactions: number;
  blocks: number;
}

export interface ScitIndexConfig {
  profileId: string;
  baseScoutRoot: string;
  activationHeight?: number;
  minimumCarrierSats?: number;
  minimumFusionAge?: number;
  maximumDepth?: number;
  initialTip?: { height: number; hash: string };
}

interface BaseTransition {
  txid: string;
}

export interface ScitBirthTransition extends BaseTransition {
  kind: 'BIRTH';
  organismId: string;
  stateRoot: string;
  seedOutpoint: ScitOutpoint;
  carrier: ScitCarrier;
  fundingInputCount: number;
}

export interface ScitTransferTransition extends BaseTransition {
  kind: 'TRANSFER';
  organismId: string;
  successorCarrier: ScitCarrier;
  feeInputCount: number;
}

export interface ScitCheckpointTransition extends BaseTransition {
  kind: 'CHECKPOINT';
  organismId: string;
  stateRoot: string;
  successorCarrier: ScitCarrier;
  feeInputCount: number;
}

export interface ScitFusionTransition extends BaseTransition {
  kind: 'FUSE';
  parentIds: readonly string[];
  organismId: string;
  stateRoot: string;
  carrier: ScitCarrier;
  refunds: readonly ScitCarrier[];
  sponsorInputCount: number;
}

export interface ScitRetireTransition extends BaseTransition {
  kind: 'RETIRE';
  organismId: string;
  refund: ScitCarrier;
  feeInputCount: number;
}

export interface ScitInvalidSpendTransition extends BaseTransition {
  kind: 'INVALID_SPEND';
  consumedOrganismIds: readonly string[];
  reason: string;
}

export type ScitIndexTransition =
  | ScitBirthTransition
  | ScitTransferTransition
  | ScitCheckpointTransition
  | ScitFusionTransition
  | ScitRetireTransition
  | ScitInvalidSpendTransition;

export interface ScitIndexBlock {
  height: number;
  hash: string;
  previousHash: string;
  transitions: readonly ScitIndexTransition[];
}

export interface ScitIndexSnapshot {
  tip: { height: number; hash: string } | null;
  counters: ScitSupplyCounters;
  organisms: ScitOrganismRecord[];
}

interface MutableSnapshot {
  tip: { height: number; hash: string } | null;
  counters: ScitSupplyCounters;
  organisms: Map<string, ScitOrganismRecord>;
  carrierIndex: Map<string, string>;
  seenIds: Set<string>;
  seenTransactions: Set<string>;
}

interface UndoEntry {
  blockHash: string;
  before: MutableSnapshot;
}

const EMPTY_COUNTERS: Readonly<ScitSupplyCounters> = Object.freeze({
  lifetimeCreated: 0,
  active: 0,
  retiredExplicit: 0,
  retiredByFusion: 0,
  burnedInvalid: 0,
  validEvents: 0,
  invalidSpendTransactions: 0,
  blocks: 0,
});

export class ScitInMemoryIndexState {
  private readonly config: Required<
    Pick<
      ScitIndexConfig,
      | 'profileId'
      | 'baseScoutRoot'
      | 'activationHeight'
      | 'minimumCarrierSats'
      | 'minimumFusionAge'
      | 'maximumDepth'
    >
  >;
  private tip: { height: number; hash: string } | null;
  private counters: ScitSupplyCounters = { ...EMPTY_COUNTERS };
  private organisms = new Map<string, ScitOrganismRecord>();
  private carrierIndex = new Map<string, string>();
  private seenIds = new Set<string>();
  private seenTransactions = new Set<string>();
  private readonly undo: UndoEntry[] = [];

  constructor(input: ScitIndexConfig) {
    requiredDigest(input.profileId, 'profile id');
    requiredDigest(input.baseScoutRoot, 'base Scout root');
    const activationHeight = input.activationHeight ?? 0;
    const minimumCarrierSats = input.minimumCarrierSats ?? 1000;
    const minimumFusionAge = input.minimumFusionAge ?? 144;
    const maximumDepth = input.maximumDepth ?? 64;
    assertNonnegativeInteger(activationHeight, 'activation height');
    assertPositiveInteger(minimumCarrierSats, 'minimum carrier value');
    assertNonnegativeInteger(minimumFusionAge, 'minimum fusion age');
    assertNonnegativeInteger(maximumDepth, 'maximum depth');
    this.config = {
      profileId: input.profileId.toLowerCase(),
      baseScoutRoot: input.baseScoutRoot.toLowerCase(),
      activationHeight,
      minimumCarrierSats,
      minimumFusionAge,
      maximumDepth,
    };
    this.tip = input.initialTip
      ? {
          height: input.initialTip.height,
          hash: normalizedHash(input.initialTip.hash, 'initial tip hash'),
        }
      : null;
    if (this.tip)
      assertNonnegativeInteger(this.tip.height, 'initial tip height');
  }

  applyBlock(block: ScitIndexBlock): ScitIndexSnapshot {
    this.validateBlockLink(block);
    const before = this.captureMutableSnapshot();
    try {
      for (const transition of block.transitions) {
        this.applyTransition(transition, block.height);
      }
      this.tip = {
        height: block.height,
        hash: normalizedHash(block.hash, 'block hash'),
      };
      this.counters.blocks += 1;
      this.assertSupplyInvariant();
      this.undo.push({ blockHash: this.tip.hash, before });
      return this.snapshot();
    } catch (error: unknown) {
      this.restoreMutableSnapshot(before);
      throw error;
    }
  }

  undoLastBlock(expectedBlockHash?: string): ScitIndexSnapshot {
    const entry = this.undo[this.undo.length - 1];
    scitAssert(
      entry != null,
      'UNDO_EMPTY',
      'No applied SCIT block is available to undo',
    );
    if (expectedBlockHash != null) {
      scitAssert(
        entry.blockHash ===
          normalizedHash(expectedBlockHash, 'expected block hash'),
        'UNDO_TIP_MISMATCH',
        'Requested SCIT block undo does not match the current tip',
      );
    }
    this.undo.pop();
    this.restoreMutableSnapshot(entry.before);
    this.assertSupplyInvariant();
    return this.snapshot();
  }

  snapshot(): ScitIndexSnapshot {
    return {
      tip: this.tip ? { ...this.tip } : null,
      counters: { ...this.counters },
      organisms: [...this.organisms.values()]
        .sort((left, right) =>
          compareHexBytes(left.organismId, right.organismId),
        )
        .map(cloneRecord),
    };
  }

  getOrganism(organismId: string): ScitOrganismRecord | null {
    const record = this.organisms.get(
      normalizedDigest(organismId, 'organism id'),
    );
    return record ? cloneRecord(record) : null;
  }

  organismAtCarrier(outpoint: ScitOutpoint): ScitOrganismRecord | null {
    const id = this.carrierIndex.get(outpointKey(outpoint));
    return id ? this.getOrganism(id) : null;
  }

  get undoDepth(): number {
    return this.undo.length;
  }

  private applyTransition(
    transition: ScitIndexTransition,
    height: number,
  ): void {
    const txid = normalizedHash(transition.txid, 'transaction id');
    scitAssert(
      !this.seenTransactions.has(txid),
      'DUPLICATE_TRANSACTION',
      'A transaction may be applied only once on the active SCIT chain',
    );
    switch (transition.kind) {
      case 'BIRTH':
        this.applyBirth({ ...transition, txid }, height);
        break;
      case 'TRANSFER':
        this.applyTransfer({ ...transition, txid });
        break;
      case 'CHECKPOINT':
        this.applyCheckpoint({ ...transition, txid });
        break;
      case 'FUSE':
        this.applyFusion({ ...transition, txid }, height);
        break;
      case 'RETIRE':
        this.applyRetire({ ...transition, txid });
        break;
      case 'INVALID_SPEND':
        this.applyInvalidSpend({ ...transition, txid });
        break;
      default: {
        const exhaustive: never = transition;
        throw new Error(`Unsupported SCIT transition: ${String(exhaustive)}`);
      }
    }
    this.seenTransactions.add(txid);
    this.assertSupplyInvariant();
  }

  private applyBirth(transition: ScitBirthTransition, height: number): void {
    assertPositiveInteger(
      transition.fundingInputCount,
      'birth funding input count',
    );
    const stateRoot = normalizedDigest(
      transition.stateRoot,
      'birth state root',
    );
    scitAssert(
      stateRoot === this.config.baseScoutRoot,
      'BIRTH_BASE_ROOT',
      'BIRTH state root must equal the configured base Scout root',
    );
    const carrier = this.validateCarrier(transition.carrier);
    const expectedId = deriveBirthOrganismId({
      profileId: this.config.profileId,
      seedOutpoint: normalizedOutpoint(transition.seedOutpoint),
      stateRoot,
      carrierScriptHex: carrier.scriptHex,
    }).toString('hex');
    const organismId = normalizedDigest(
      transition.organismId,
      'birth organism id',
    );
    scitAssert(
      organismId === expectedId,
      'BIRTH_ID',
      'BIRTH organism ID does not match the stable identity derivation',
    );
    this.assertUnseenId(organismId);
    const carrierOutpoint = { txid: transition.txid, vout: 1 };
    this.assertUnusedCarrier(carrierOutpoint);
    const record: ScitOrganismRecord = {
      organismId,
      stateRoot,
      carrier,
      carrierOutpoint,
      birthHeight: height,
      depth: 0,
      eventSequence: 0,
      status: 'ACTIVE',
      createdBy: 'BIRTH',
      lastTxid: transition.txid,
      terminalReason: null,
    };
    this.organisms.set(organismId, record);
    this.seenIds.add(organismId);
    this.carrierIndex.set(outpointKey(carrierOutpoint), organismId);
    this.counters.lifetimeCreated += 1;
    this.counters.active += 1;
    this.counters.validEvents += 1;
  }

  private applyTransfer(transition: ScitTransferTransition): void {
    assertPositiveInteger(transition.feeInputCount, 'transfer fee input count');
    const record = this.activeRecord(transition.organismId);
    const successor = this.validateCarrier(transition.successorCarrier);
    scitAssert(
      successor.valueSats === record.carrier.valueSats,
      'TRANSFER_CARRIER_VALUE',
      'TRANSFER must preserve the parent carrier value',
    );
    scitAssert(
      successor.scriptHex !== record.carrier.scriptHex,
      'TRANSFER_OWNER_UNCHANGED',
      'TRANSFER must change the carrier owner script',
    );
    this.replaceCarrier(record, transition.txid, successor);
    record.eventSequence += 1;
    record.lastTxid = transition.txid;
    this.counters.validEvents += 1;
  }

  private applyCheckpoint(transition: ScitCheckpointTransition): void {
    assertPositiveInteger(
      transition.feeInputCount,
      'checkpoint fee input count',
    );
    const record = this.activeRecord(transition.organismId);
    const stateRoot = normalizedDigest(
      transition.stateRoot,
      'checkpoint state root',
    );
    scitAssert(
      stateRoot !== record.stateRoot,
      'CHECKPOINT_ROOT_UNCHANGED',
      'CHECKPOINT must change the committed state root',
    );
    const successor = this.validateCarrier(transition.successorCarrier);
    scitAssert(
      successor.valueSats === record.carrier.valueSats &&
        successor.scriptHex === record.carrier.scriptHex,
      'CHECKPOINT_CARRIER_CHANGED',
      'CHECKPOINT must preserve carrier script and value',
    );
    this.replaceCarrier(record, transition.txid, successor);
    record.stateRoot = stateRoot;
    record.eventSequence += 1;
    record.lastTxid = transition.txid;
    this.counters.validEvents += 1;
  }

  private applyFusion(transition: ScitFusionTransition, height: number): void {
    scitAssert(
      transition.parentIds.length >= 2 && transition.parentIds.length <= 4,
      'FUSION_ARITY',
      'FUSE must consume two to four live parents',
    );
    assertPositiveInteger(
      transition.sponsorInputCount,
      'fusion sponsor input count',
    );
    const parentIds = transition.parentIds.map((value) =>
      normalizedDigest(value, 'fusion parent id'),
    );
    assertStrictlySortedIds(parentIds);
    const parents = parentIds.map((id) => this.activeRecord(id));
    scitAssert(
      transition.refunds.length === parents.length,
      'FUSION_REFUND_COUNT',
      'FUSE must contain exactly one refund for each ordered parent',
    );
    for (const [index, parent] of parents.entries()) {
      const age = height - parent.birthHeight;
      scitAssert(
        age >= this.config.minimumFusionAge,
        'FUSION_PARENT_AGE',
        `Fusion parent ${index} is younger than the minimum active-chain age`,
      );
      const refund = this.validateCarrier(transition.refunds[index]);
      scitAssert(
        refund.scriptHex === parent.carrier.scriptHex &&
          refund.valueSats === parent.carrier.valueSats,
        'FUSION_REFUND',
        `Fusion refund ${index} must exactly return its ordered parent's carrier`,
      );
    }
    const stateRoot = normalizedDigest(
      transition.stateRoot,
      'fusion state root',
    );
    scitAssert(
      parents.every((parent) => parent.stateRoot !== stateRoot),
      'FUSION_ROOT_REUSED',
      'FUSE child state root must differ from every parent state root',
    );
    const carrier = this.validateCarrier(transition.carrier);
    const identityParents: ScitFusionParentIdentityInput[] = parents.map(
      (parent) => ({
        parentId: parent.organismId,
        parentStateRoot: parent.stateRoot,
        parentOutpoint: parent.carrierOutpoint!,
      }),
    );
    const expectedId = deriveFusionOrganismId({
      profileId: this.config.profileId,
      parents: identityParents,
      childStateRoot: stateRoot,
      childCarrierScriptHex: carrier.scriptHex,
    }).toString('hex');
    const organismId = normalizedDigest(
      transition.organismId,
      'fusion child organism id',
    );
    scitAssert(
      organismId === expectedId,
      'FUSION_ID',
      'FUSE child ID does not match the stable identity derivation',
    );
    this.assertUnseenId(organismId);
    const depth = Math.max(...parents.map((parent) => parent.depth)) + 1;
    scitAssert(
      depth <= this.config.maximumDepth,
      'FUSION_DEPTH',
      'FUSE child exceeds the configured maximum generation depth',
    );
    for (const parent of parents) {
      this.removeCarrier(parent);
      parent.status = 'RETIRED_BY_FUSION';
      parent.carrierOutpoint = null;
      parent.eventSequence += 1;
      parent.lastTxid = transition.txid;
      parent.terminalReason = 'FUSED';
    }
    const carrierOutpoint = { txid: transition.txid, vout: 1 };
    this.assertUnusedCarrier(carrierOutpoint);
    this.organisms.set(organismId, {
      organismId,
      stateRoot,
      carrier,
      carrierOutpoint,
      birthHeight: height,
      depth,
      eventSequence: 0,
      status: 'ACTIVE',
      createdBy: 'FUSE',
      lastTxid: transition.txid,
      terminalReason: null,
    });
    this.seenIds.add(organismId);
    this.carrierIndex.set(outpointKey(carrierOutpoint), organismId);
    this.counters.lifetimeCreated += 1;
    this.counters.active += 1 - parents.length;
    this.counters.retiredByFusion += parents.length;
    this.counters.validEvents += 1;
  }

  private applyRetire(transition: ScitRetireTransition): void {
    assertPositiveInteger(
      transition.feeInputCount,
      'retirement fee input count',
    );
    const record = this.activeRecord(transition.organismId);
    const refund = this.validateCarrier(transition.refund);
    scitAssert(
      refund.scriptHex === record.carrier.scriptHex &&
        refund.valueSats === record.carrier.valueSats,
      'RETIRE_REFUND',
      'RETIRE must exactly refund the former carrier script and value',
    );
    this.removeCarrier(record);
    record.status = 'RETIRED_EXPLICIT';
    record.carrierOutpoint = null;
    record.eventSequence += 1;
    record.lastTxid = transition.txid;
    record.terminalReason = 'RETIRED';
    this.counters.active -= 1;
    this.counters.retiredExplicit += 1;
    this.counters.validEvents += 1;
  }

  private applyInvalidSpend(transition: ScitInvalidSpendTransition): void {
    scitAssert(
      transition.consumedOrganismIds.length > 0,
      'INVALID_SPEND_EMPTY',
      'Invalid carrier spend must name at least one consumed live organism',
    );
    scitAssert(
      typeof transition.reason === 'string' &&
        transition.reason.trim().length > 0,
      'INVALID_SPEND_REASON',
      'Invalid carrier spend must include a stable reason code or explanation',
    );
    const ids = transition.consumedOrganismIds.map((id) =>
      normalizedDigest(id, 'consumed organism id'),
    );
    const unique = new Set(ids);
    scitAssert(
      unique.size === ids.length,
      'INVALID_SPEND_DUPLICATE',
      'Invalid carrier spend cannot name the same organism twice',
    );
    const records = ids.map((id) => this.activeRecord(id));
    for (const record of records) {
      this.removeCarrier(record);
      record.status = 'BURNED_INVALID';
      record.carrierOutpoint = null;
      record.eventSequence += 1;
      record.lastTxid = transition.txid;
      record.terminalReason = transition.reason.trim();
    }
    this.counters.active -= records.length;
    this.counters.burnedInvalid += records.length;
    this.counters.invalidSpendTransactions += 1;
  }

  private replaceCarrier(
    record: ScitOrganismRecord,
    txid: string,
    carrier: ScitCarrier,
  ): void {
    this.removeCarrier(record);
    const nextOutpoint = { txid, vout: 1 };
    this.assertUnusedCarrier(nextOutpoint);
    record.carrier = carrier;
    record.carrierOutpoint = nextOutpoint;
    this.carrierIndex.set(outpointKey(nextOutpoint), record.organismId);
  }

  private removeCarrier(record: ScitOrganismRecord): void {
    scitAssert(
      record.carrierOutpoint != null,
      'CARRIER_MISSING',
      'Active SCIT organism is missing its live carrier outpoint',
    );
    this.carrierIndex.delete(outpointKey(record.carrierOutpoint));
  }

  private validateCarrier(input: ScitCarrier): ScitCarrier {
    const script = bytesFromHex(input.scriptHex, 'carrier script');
    scitAssert(
      script.length === 34 && script[0] === 0x51 && script[1] === 0x20,
      'CARRIER_NOT_P2TR',
      'SCIT carrier must be a 34-byte P2TR script',
    );
    scitAssert(
      Number.isSafeInteger(input.valueSats) &&
        input.valueSats >= this.config.minimumCarrierSats,
      'CARRIER_VALUE',
      `SCIT carrier must contain at least ${this.config.minimumCarrierSats} sats`,
    );
    return { scriptHex: script.toString('hex'), valueSats: input.valueSats };
  }

  private activeRecord(organismId: string): ScitOrganismRecord {
    const id = normalizedDigest(organismId, 'organism id');
    const record = this.organisms.get(id);
    scitAssert(
      record != null && record.status === 'ACTIVE',
      'PARENT_NOT_ACTIVE',
      'SCIT parent must exist and have an active live carrier',
    );
    return record;
  }

  private assertUnseenId(organismId: string): void {
    scitAssert(
      !this.seenIds.has(organismId),
      'ORGANISM_ID_REUSED',
      'SCIT organism ID has already been claimed on the active chain',
    );
  }

  private assertUnusedCarrier(outpoint: ScitOutpoint): void {
    scitAssert(
      !this.carrierIndex.has(outpointKey(outpoint)),
      'CARRIER_OUTPOINT_REUSED',
      'SCIT carrier outpoint is already live',
    );
  }

  private validateBlockLink(block: ScitIndexBlock): void {
    assertNonnegativeInteger(block.height, 'block height');
    scitAssert(
      block.height >= this.config.activationHeight,
      'BEFORE_ACTIVATION',
      'SCIT transitions cannot be applied before activation height',
    );
    const blockHash = normalizedHash(block.hash, 'block hash');
    const previousHash = normalizedHash(
      block.previousHash,
      'previous block hash',
    );
    scitAssert(
      blockHash !== previousHash,
      'BLOCK_HASH_REPEATED',
      'Block hash must differ from its previous block hash',
    );
    if (this.tip) {
      scitAssert(
        block.height === this.tip.height + 1,
        'BLOCK_HEIGHT_GAP',
        'SCIT blocks must be applied in contiguous height order',
      );
      scitAssert(
        previousHash === this.tip.hash,
        'BLOCK_PREVIOUS_HASH',
        'SCIT block does not extend the current active-chain tip',
      );
    }
    scitAssert(
      Array.isArray(block.transitions),
      'BLOCK_TRANSITIONS',
      'SCIT block transitions must be an ordered array',
    );
  }

  private assertSupplyInvariant(): void {
    const statusCounts = {
      ACTIVE: 0,
      RETIRED_EXPLICIT: 0,
      RETIRED_BY_FUSION: 0,
      BURNED_INVALID: 0,
    };
    for (const record of this.organisms.values())
      statusCounts[record.status] += 1;
    scitAssert(
      this.counters.active === statusCounts.ACTIVE &&
        this.counters.retiredExplicit === statusCounts.RETIRED_EXPLICIT &&
        this.counters.retiredByFusion === statusCounts.RETIRED_BY_FUSION &&
        this.counters.burnedInvalid === statusCounts.BURNED_INVALID &&
        this.counters.lifetimeCreated === this.organisms.size &&
        this.counters.lifetimeCreated ===
          this.counters.active +
            this.counters.retiredExplicit +
            this.counters.retiredByFusion +
            this.counters.burnedInvalid,
      'SUPPLY_INVARIANT',
      'SCIT supply counters do not match indexed organism states',
    );
  }

  private captureMutableSnapshot(): MutableSnapshot {
    return {
      tip: this.tip ? { ...this.tip } : null,
      counters: { ...this.counters },
      organisms: new Map(
        [...this.organisms.entries()].map(([id, record]) => [
          id,
          cloneRecord(record),
        ]),
      ),
      carrierIndex: new Map(this.carrierIndex),
      seenIds: new Set(this.seenIds),
      seenTransactions: new Set(this.seenTransactions),
    };
  }

  private restoreMutableSnapshot(snapshot: MutableSnapshot): void {
    this.tip = snapshot.tip ? { ...snapshot.tip } : null;
    this.counters = { ...snapshot.counters };
    this.organisms = new Map(
      [...snapshot.organisms.entries()].map(([id, record]) => [
        id,
        cloneRecord(record),
      ]),
    );
    this.carrierIndex = new Map(snapshot.carrierIndex);
    this.seenIds = new Set(snapshot.seenIds);
    this.seenTransactions = new Set(snapshot.seenTransactions);
  }
}

function cloneRecord(record: ScitOrganismRecord): ScitOrganismRecord {
  return {
    ...record,
    carrier: { ...record.carrier },
    carrierOutpoint: record.carrierOutpoint
      ? { ...record.carrierOutpoint }
      : null,
  };
}

function normalizedDigest(value: string, label: string): string {
  requiredDigest(value, label);
  return value.toLowerCase();
}

function normalizedHash(value: string, label: string): string {
  return bytes32FromHex(value, label).toString('hex');
}

function requiredDigest(value: string, label: string): void {
  const bytes = bytes32FromHex(value, label);
  scitAssert(!isZeroBytes(bytes), 'ZERO_DIGEST', `${label} must be nonzero`);
}

function normalizedOutpoint(outpoint: ScitOutpoint): ScitOutpoint {
  assertNonnegativeInteger(outpoint.vout, 'outpoint vout');
  scitAssert(
    outpoint.vout <= 0xffffffff,
    'OUTPOINT_VOUT',
    'Outpoint vout must fit in u32',
  );
  return {
    txid: normalizedHash(outpoint.txid, 'outpoint txid'),
    vout: outpoint.vout,
  };
}

function outpointKey(outpoint: ScitOutpoint): string {
  const normalized = normalizedOutpoint(outpoint);
  return `${normalized.txid}:${normalized.vout}`;
}

function assertStrictlySortedIds(ids: readonly string[]): void {
  for (let index = 1; index < ids.length; index += 1) {
    scitAssert(
      compareHexBytes(ids[index - 1], ids[index]) < 0,
      ids[index - 1] === ids[index]
        ? 'FUSION_DUPLICATE_PARENT'
        : 'FUSION_PARENT_ORDER',
      'Fusion parent IDs must be unique and in bytewise ascending order',
    );
  }
}

function assertPositiveInteger(value: number, label: string): void {
  scitAssert(
    Number.isSafeInteger(value) && value > 0,
    'INVALID_POSITIVE_INTEGER',
    `${label} must be a positive safe integer`,
  );
}

function assertNonnegativeInteger(value: number, label: string): void {
  scitAssert(
    Number.isSafeInteger(value) && value >= 0,
    'INVALID_NONNEGATIVE_INTEGER',
    `${label} must be a nonnegative safe integer`,
  );
}
