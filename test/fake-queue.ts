/** In-memory stand-ins for BullMQ Queue/FlowProducer: specs drive job states by hand, no Redis. */
export class FakeJob {
  state = 'waiting';
  failedReason?: string;
  returnvalue: unknown;
  childrenValues: Record<string, unknown> = {};

  constructor(
    readonly id: string,
    readonly name: string,
    readonly data: any,
    readonly queueName: string,
    readonly opts: any = {},
  ) {}

  async getState(): Promise<string> {
    return this.state;
  }

  async getChildrenValues(): Promise<Record<string, unknown>> {
    return this.childrenValues;
  }
}

export class FakeQueue {
  readonly jobs = new Map<string, FakeJob>();
  private seq = 0;

  constructor(readonly name: string) {}

  async add(name: string, data: any, opts: any = {}): Promise<FakeJob> {
    const id = opts.jobId ?? `job-${++this.seq}`;
    const job = new FakeJob(id, name, data, this.name, opts);
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string): Promise<FakeJob | undefined> {
    return this.jobs.get(id);
  }
}

export interface FakeFlow {
  name: string;
  queueName: string;
  data: any;
  opts?: any;
  children?: FakeFlow[];
}

/** Records each flow and creates its jobs in the matching fake queues. */
export class FakeFlowProducer {
  readonly flows: FakeFlow[] = [];

  constructor(private readonly queues: Record<string, FakeQueue>) {}

  async add(flow: FakeFlow): Promise<{ job: FakeJob }> {
    this.flows.push(flow);
    return { job: await this.createJobs(flow) };
  }

  private async createJobs(flow: FakeFlow): Promise<FakeJob> {
    for (const child of flow.children ?? []) await this.createJobs(child);
    const job = await this.queues[flow.queueName].add(
      flow.name,
      flow.data,
      flow.opts,
    );
    if (flow.children?.length) job.state = 'waiting-children';
    return job;
  }
}
