import { describe, it, expect, beforeEach } from "vitest";
import { BrowserStorageSaver } from "../src/agent/checkpointer.js";
import type { Checkpoint, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

const storageData: Record<string, any> = {};
(globalThis as any).browser = {
  storage: {
    local: {
      get: async (keys: string | string[] | null) => {
        if (typeof keys === "string") return { [keys]: storageData[keys] };
        if (Array.isArray(keys)) {
          const result: Record<string, any> = {};
          for (const k of keys) if (k in storageData) result[k] = storageData[k];
          return result;
        }
        return { ...storageData };
      },
      set: async (obj: Record<string, any>) => {
        Object.assign(storageData, obj);
      },
    },
  },
};

function makeCheckpoint(threadId: string): { config: RunnableConfig; checkpoint: Checkpoint; metadata: CheckpointMetadata } {
  const checkpoint: Checkpoint = {
    v: 1,
    id: "ckpt-" + Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
    channel_values: { messages: ["hello"], rawPage: "page content here" },
    channel_versions: { messages: "1", rawPage: "1" },
    versions_seen: {},
  };
  const metadata: CheckpointMetadata = {
    source: "loop",
    step: 1,
    parents: {},
  };
  const config: RunnableConfig = {
    configurable: { thread_id: threadId, checkpoint_ns: "", checkpoint_id: checkpoint.id },
  };
  return { config, checkpoint, metadata };
}

describe("BrowserStorageSaver", () => {
  let saver: BrowserStorageSaver;

  beforeEach(() => {
    for (const key of Object.keys(storageData)) delete storageData[key];
    saver = new BrowserStorageSaver();
  });

  it("round-trips a checkpoint through browser.storage.local", async () => {
    const { config, checkpoint, metadata } = makeCheckpoint("thread-1");

    await saver.put(config, checkpoint, metadata);
    const tuple = await saver.getTuple(config);

    expect(tuple).toBeDefined();
    expect(tuple!.checkpoint.id).toBe(checkpoint.id);
    expect(tuple!.checkpoint.channel_values.rawPage).toBe("page content here");
    expect(tuple!.metadata!.source).toBe("loop");
  });

  it("reads the latest checkpoint when no checkpoint_id given", async () => {
    const { config: config1, checkpoint: ckpt1, metadata: meta1 } = makeCheckpoint("thread-2");
    const config2: RunnableConfig = {
      configurable: { thread_id: "thread-2", checkpoint_ns: "", checkpoint_id: "ckpt-later" },
    };
    const ckpt2: Checkpoint = { ...ckpt1, id: "ckpt-later" };

    await saver.put(config1, ckpt1, meta1);
    await saver.put(config2, ckpt2, meta1);

    const tuple = await saver.getTuple({ configurable: { thread_id: "thread-2", checkpoint_ns: "" } });
    expect(tuple!.checkpoint.id).toBe("ckpt-later");
  });

  it("lists checkpoints newest-first", async () => {
    const { config: config1, checkpoint: ckpt1, metadata } = makeCheckpoint("thread-3");
    const config2: RunnableConfig = {
      configurable: { thread_id: "thread-3", checkpoint_ns: "", checkpoint_id: "ckpt-b" },
    };
    const ckpt2: Checkpoint = { ...ckpt1, id: "ckpt-b" };

    await saver.put(config1, ckpt1, metadata);
    await saver.put(config2, ckpt2, metadata);

    const tuples = [];
    for await (const t of saver.list({ configurable: { thread_id: "thread-3", checkpoint_ns: "" } })) {
      tuples.push(t);
    }
    expect(tuples.length).toBe(2);
    expect(tuples[0]!.checkpoint.id).toBe("ckpt-b");
    expect(tuples[1]!.checkpoint.id).toBe(ckpt1.id);
  });

  it("returns undefined for unknown thread", async () => {
    const tuple = await saver.getTuple({ configurable: { thread_id: "nonexistent", checkpoint_ns: "" } });
    expect(tuple).toBeUndefined();
  });

  it("deleteThread removes all checkpoints and writes for a thread", async () => {
    const { config, checkpoint, metadata } = makeCheckpoint("thread-4");
    await saver.put(config, checkpoint, metadata);
    await saver.putWrites(config, [["messages", { role: "assistant", content: "hi" }]], "task-1");

    await saver.deleteThread("thread-4");

    const tuple = await saver.getTuple(config);
    expect(tuple).toBeUndefined();
  });

  it("isolates threads by thread_id", async () => {
    const { config: configA, checkpoint: ckptA, metadata: metaA } = makeCheckpoint("thread-A");
    const { config: configB, checkpoint: ckptB, metadata: metaB } = makeCheckpoint("thread-B");

    await saver.put(configA, ckptA, metaA);
    await saver.put(configB, ckptB, metaB);

    const tupleA = await saver.getTuple({ configurable: { thread_id: "thread-A", checkpoint_ns: "" } });
    const tupleB = await saver.getTuple({ configurable: { thread_id: "thread-B", checkpoint_ns: "" } });

    expect(tupleA!.checkpoint.id).toBe(ckptA.id);
    expect(tupleB!.checkpoint.id).toBe(ckptB.id);
  });
});
