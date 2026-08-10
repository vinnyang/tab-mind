import { BaseCheckpointSaver } from "@langchain/langgraph/web";
import type {
  Checkpoint, CheckpointTuple, CheckpointMetadata, CheckpointListOptions,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

declare const browser: {
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
    };
  };
};

const KEY = "tabmind_threads";
type Row = {
  id: string; ns: string; parent?: string;
  ckpt: [string, number[]]; meta: [string, number[]];
};
type Db = { ckpts: Record<string, Row[]>; writes: Record<string, any[]> };

async function readAll(): Promise<Db> {
  const r = await browser.storage.local.get(KEY);
  return r[KEY] ?? { ckpts: {}, writes: {} };
}
async function writeAll(db: Db) { await browser.storage.local.set({ [KEY]: db }); }

export class BrowserStorageSaver extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    const ckptId = config.configurable?.checkpoint_id as string | undefined;
    const db = await readAll();
    const list = db.ckpts[threadId] ?? [];
    if (!list.length) return undefined;
    const row = ckptId ? list.find((r) => r.id === ckptId) : list[list.length - 1];
    if (!row) return undefined;

    // CRITICAL: JSON storage turns Uint8Array into a plain array.
    // loadsTyped REQUIRES a Uint8Array or it throws ERR_INVALID_ARG_TYPE.
    const u8 = (a: number[]) => new Uint8Array(a);
    const pending = db.writes[`${threadId}:${row.id}`] ?? [];

    return {
      config: { configurable: { thread_id: threadId, checkpoint_ns: row.ns, checkpoint_id: row.id } },
      checkpoint: await this.serde.loadsTyped(row.ckpt[0], u8(row.ckpt[1])) as Checkpoint,
      metadata: await this.serde.loadsTyped(row.meta[0], u8(row.meta[1])) as CheckpointMetadata,
      parentConfig: row.parent
        ? { configurable: { thread_id: threadId, checkpoint_ns: row.ns, checkpoint_id: row.parent } }
        : undefined,
      pendingWrites: await Promise.all(
        pending.map(async (w) => [w.taskId, w.ch, await this.serde.loadsTyped(w.t, u8(w.b))] as [string, string, unknown]),
      ),
    };
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions) {
    const threadId = config.configurable?.thread_id as string;
    const db = await readAll();
    let rows = [...(db.ckpts[threadId] ?? [])].reverse();
    if (options?.limit) rows = rows.slice(0, options.limit);
    for (const row of rows) {
      yield {
        config: { configurable: { thread_id: threadId, checkpoint_ns: row.ns, checkpoint_id: row.id } },
        checkpoint: await this.serde.loadsTyped(row.ckpt[0], new Uint8Array(row.ckpt[1])) as Checkpoint,
        metadata: await this.serde.loadsTyped(row.meta[0], new Uint8Array(row.meta[1])) as CheckpointMetadata,
      } as CheckpointTuple;
    }
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata) {
    const threadId = config.configurable?.thread_id as string;
    const ns = (config.configurable?.checkpoint_ns as string) ?? "";
    const db = await readAll();
    db.ckpts[threadId] ??= [];
    const [ct, cb] = await this.serde.dumpsTyped(checkpoint);
    const [mt, mb] = await this.serde.dumpsTyped(metadata);
    db.ckpts[threadId].push({
      id: checkpoint.id, ns,
      parent: config.configurable?.checkpoint_id as string | undefined,
      ckpt: [ct, Array.from(cb)], meta: [mt, Array.from(mb)],
    });
    await writeAll(db);
    return { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id } };
  }

  async putWrites(config: RunnableConfig, writes: [string, unknown][], taskId: string) {
    const threadId = config.configurable?.thread_id as string;
    const k = `${threadId}:${config.configurable?.checkpoint_id}`;
    const db = await readAll();
    db.writes[k] ??= [];
    for (const [ch, val] of writes) {
      const [t, b] = await this.serde.dumpsTyped(val);
      db.writes[k].push({ taskId, ch, t, b: Array.from(b) });
    }
    await writeAll(db);
  }

  async deleteThread(threadId: string) {
    const db = await readAll();
    delete db.ckpts[threadId];
    for (const k of Object.keys(db.writes)) {
      if (k.startsWith(`${threadId}:`)) delete db.writes[k];
    }
    await writeAll(db);
  }
}
