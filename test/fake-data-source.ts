/** `DataSource` stand-in for specs built on mocked repositories: one manager over the given repos. */
export function transactionOver(repos: Record<string, unknown>, options: { onLock?: (key: string) => void } = {}) {
  const manager = {
    getRepository: (entity: Function) => {
      const repo = repos[entity.name];
      if (!repo) throw new Error(`No fake repository for ${entity.name}`);
      return repo;
    },
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (/pg_advisory_xact_lock/.test(sql)) options.onLock?.(String(params[0]));
      return [];
    }),
  };
  return { manager, transaction: async <T>(work: (m: typeof manager) => Promise<T>) => work(manager) };
}
