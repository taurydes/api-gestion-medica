import { FindOperator } from 'typeorm';

type Row = Record<string, any>;
type Tables = Map<Function, Row[]>;

export interface FakeTableOptions {
  /** Columns with a unique index: a duplicate save throws like PostgreSQL (code 23505). */
  unique?: string[];
}

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

  createQueryBuilder() {
    const qb: any = {
      where: () => qb,
      andWhere: () => qb,
      orderBy: () => qb,
      getOne: async () => null,
    };
    return qb;
  }
}

/**
 * In-memory database whose `transaction()` works on a copy and only publishes it when the callback
 * resolves, so tests can assert that a failed transaction leaves nothing behind.
 */
export class InMemoryDb {
  private readonly committed: Tables = new Map();
  private readonly options = new Map<Function, FakeTableOptions>();
  private readonly failures = new Map<Function, number>();

  table(entity: Function, rows: Row[] = [], options: FakeTableOptions = {}) {
    this.committed.set(entity, rows.map((r) => ({ ...r })));
    this.options.set(entity, options);
    return this;
  }

  /** Committed rows of a table. */
  rows(entity: Function): Row[] {
    return this.committed.get(entity) ?? [];
  }

  /** The next N saves on `entity` throw, to simulate a failure in the middle of a transaction. */
  failSaves(entity: Function, times = 1) {
    this.failures.set(entity, times);
  }

  private managerOver(tables: Tables) {
    const repos = new Map<Function, FakeRepo>();
    return {
      getRepository: (entity: Function) => {
        if (!repos.has(entity)) {
          if (!tables.has(entity)) tables.set(entity, []);
          const repo = new FakeRepo(tables.get(entity)!, this.options.get(entity));
          const originalSave = repo.save.bind(repo);
          repo.save = async (input: any) => {
            const pending = this.failures.get(entity) ?? 0;
            if (pending > 0) {
              this.failures.set(entity, pending - 1);
              throw new Error('simulated database failure');
            }
            return originalSave(input);
          };
          repos.set(entity, repo);
        }
        return repos.get(entity)!;
      },
    };
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
        for (const [entity, rows] of this.committed) {
          staged.set(entity, rows.map((r) => ({ ...r })));
        }
        const result = await work(this.managerOver(staged));
        // Commit in place so repositories created before the transaction see the new rows.
        for (const [entity, rows] of staged) {
          const target = this.committed.get(entity);
          if (target) target.splice(0, target.length, ...rows);
          else this.committed.set(entity, rows);
        }
        return result;
      },
    };
  }
}
