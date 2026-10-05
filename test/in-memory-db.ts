import { FindOperator } from 'typeorm';

type Row = Record<string, any>;
type Tables = Map<Function, Row[]>;

export interface FakeTableOptions {
  /** Columns with a unique index: a duplicate save throws like PostgreSQL (code 23505). */
  unique?: string[];
}

// Shared by every FakeRepo, like a PostgreSQL sequence is shared by every connection.
const sequences = new Map<string, number>();

/** Minimal repository over an array; supports the operators the services use (IsNull, In). */
export class FakeRepo {
  constructor(
    private readonly rows: Row[],
    private readonly options: FakeTableOptions = {},
  ) {}

  private matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return row[key] == null;
        if (expected.type === 'in') return (expected.value as any[]).includes(row[key]);
        if (expected.type === 'not') return row[key] !== expected.value;
        throw new Error(`Operator ${expected.type} not supported by FakeRepo`);
      }
      return row[key] === expected;
    });
  }

  async findOne(opts: { where?: Row } = {}) {
    const row = this.rows.find((r) => this.matches(r, opts.where));
    return row ? { ...row } : null;
  }

  async find(opts: { where?: Row } = {}) {
    return this.rows.filter((r) => this.matches(r, opts.where)).map((r) => ({ ...r }));
  }

  async count(opts: { where?: Row } = {}) {
    return this.rows.filter((r) => this.matches(r, opts.where)).length;
  }

  async findBy(where: Row) {
    return this.find({ where });
  }

  async findOneBy(where: Row) {
    return this.findOne({ where });
  }

  create<T extends Row>(data: T): T {
    return { ...data };
  }

  async save(input: Row | Row[]) {
    const list = Array.isArray(input) ? input : [input];
    for (const entity of list) {
      entity.id ??= `id-${Math.random().toString(36).slice(2, 10)}`;
      for (const column of this.options.unique ?? []) {
        const clash = this.rows.find(
          (r) => r.id !== entity.id && r[column] != null && r[column] === entity[column],
        );
        if (clash) {
          throw Object.assign(
            new Error(`duplicate key value violates unique constraint (${column})`),
            { code: '23505' },
          );
        }
      }
      const index = this.rows.findIndex((r) => r.id === entity.id);
      if (index >= 0) this.rows[index] = { ...this.rows[index], ...entity };
      else this.rows.push({ ...entity });
    }
    return input;
  }

  async update(criteria: string | Row, patch: Row) {
    const where = typeof criteria === 'string' ? { id: criteria } : criteria;
    this.rows.filter((r) => this.matches(r, where)).forEach((r) => Object.assign(r, patch));
  }

  async delete(criteria: Row) {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.matches(this.rows[i], criteria)) this.rows.splice(i, 1);
    }
  }

  /** Only `SELECT nextval('<seq>') AS value`, the one raw query the services issue. */
  async query(sql: string) {
    const name = /nextval\('([^']+)'\)/.exec(sql)?.[1];
    if (!name) throw new Error(`Query not supported by FakeRepo: ${sql}`);
    const value = (sequences.get(name) ?? 0) + 1;
    sequences.set(name, value);
    return [{ value: String(value) }];
  }

  /** Filters are not interpreted: getMany/getCount return the whole table, so a spec keeps one doctor/day per table. */
  createQueryBuilder() {
    const qb: any = {
      where: () => qb,
      andWhere: () => qb,
      orderBy: () => qb,
      getOne: async () => null,
      getMany: async () => this.rows.map((r) => ({ ...r })),
      getCount: async () => this.rows.length,
    };
    return qb;
  }
}

/** What a transaction knows about itself: the advisory locks it holds and whether it already wrote. */
interface TxState {
  held: Array<() => void>;
  dirty: boolean;
  refresh: () => void;
}

/**
 * In-memory database whose `transaction()` works on a copy and only publishes it when the callback
 * resolves, so tests can assert that a failed transaction leaves nothing behind.
 */
export class InMemoryDb {
  private readonly committed: Tables = new Map();
  private readonly options = new Map<Function, FakeTableOptions>();
  private readonly failures = new Map<Function, { times: number; after: number }>();

  table(entity: Function, rows: Row[] = [], options: FakeTableOptions = {}) {
    this.committed.set(entity, rows.map((r) => ({ ...r })));
    this.options.set(entity, options);
    return this;
  }

  /** Committed rows of a table. */
  rows(entity: Function): Row[] {
    return this.committed.get(entity) ?? [];
  }

  /** After `after` successful saves, the next `times` saves on `entity` throw (a failure mid-transaction). */
  failSaves(entity: Function, times = 1, after = 0) {
    this.failures.set(entity, { times, after });
  }

  /** Every `pg_advisory_xact_lock` key taken, in acquisition order. */
  readonly locks: string[] = [];
  private readonly lockTails = new Map<string, Promise<void>>();

  private managerOver(tables: Tables, tx?: TxState) {
    const repos = new Map<Function, FakeRepo>();
    return {
      getRepository: (entity: Function) => {
        if (!repos.has(entity)) {
          if (!tables.has(entity)) tables.set(entity, []);
          const repo = new FakeRepo(tables.get(entity)!, this.options.get(entity));
          const originalSave = repo.save.bind(repo);
          repo.save = async (input: any) => {
            if (tx) tx.dirty = true;
            const pending = this.failures.get(entity);
            if (pending && pending.after > 0) {
              pending.after--;
            } else if (pending && pending.times > 0) {
              pending.times--;
              throw new Error('simulated database failure');
            }
            return originalSave(input);
          };
          repos.set(entity, repo);
        }
        return repos.get(entity)!;
      },
      /**
       * Only `SELECT pg_advisory_xact_lock(hashtext($1))`: queues behind the current holder of the key and,
       * once granted, refreshes the transaction's view with what the holder committed (READ COMMITTED).
       */
      query: async (sql: string, params: unknown[] = []) => {
        if (!/pg_advisory_xact_lock/.test(sql)) throw new Error(`Query not supported by InMemoryDb: ${sql}`);
        if (!tx) throw new Error('pg_advisory_xact_lock is only meaningful inside a transaction');
        if (tx.dirty) throw new Error('The advisory lock must be taken before the transaction writes');
        await this.acquire(String(params[0]), tx);
        tx.refresh();
        return [];
      },
    };
  }

  private async acquire(key: string, tx: TxState): Promise<void> {
    const previous = this.lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    this.lockTails.set(key, previous.then(() => mine));
    await previous;
    tx.held.push(release);
    this.locks.push(key);
  }

  /** Repository over committed data (what a repository injected outside a transaction sees). */
  repo(entity: Function): any {
    return this.managerOver(this.committed).getRepository(entity);
  }

  /** Stand-in for `DataSource`: `transaction` + `manager`. */
  get dataSource(): any {
    return {
      manager: this.managerOver(this.committed),
      transaction: async <T>(work: (manager: any) => Promise<T>): Promise<T> => {
        const staged: Tables = new Map();
        // In place, so repositories already created over `staged` see the refreshed rows.
        const refresh = () => {
          for (const [entity, rows] of this.committed) {
            const copies = rows.map((r) => ({ ...r }));
            const target = staged.get(entity);
            if (target) target.splice(0, target.length, ...copies);
            else staged.set(entity, copies);
          }
        };
        refresh();
        const tx: TxState = { held: [], dirty: false, refresh };
        try {
          const result = await work(this.managerOver(staged, tx));
          // Commit in place so repositories created before the transaction see the new rows.
          for (const [entity, rows] of staged) {
            const target = this.committed.get(entity);
            if (target) target.splice(0, target.length, ...rows);
            else this.committed.set(entity, rows);
          }
          return result;
        } finally {
          tx.held.forEach((release) => release());
        }
      },
    };
  }
}
