import type { LocalStore } from "@pulso/sync/local-db";

/** Optimistic local concurrency, including a tombstone after consumption. */
export class DraftStorage {
  private token: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private db: LocalStore,
    readonly key: string,
  ) {}
  private get versionKey() {
    return "draft-version:" + this.key;
  }

  async read<T>() {
    return this.db.transaction("r", this.db.meta, async () => {
      const entry = await this.db.meta.get(this.key);
      this.token = (await this.db.meta.get(this.versionKey))?.value as
        string | undefined;
      return entry?.value as T | undefined;
    });
  }

  write(value: unknown): Promise<void> {
    // Capture before awaiting prior writes: refs may change on the next keystroke.
    return this.mutate(structuredClone(value));
  }
  remove(): Promise<void> {
    return this.mutate(undefined);
  }
  async assertCurrent() {
    await this.queue;
    const version = (await this.db.meta.get(this.versionKey))?.value;
    if (version !== this.token)
      throw Error(
        "El borrador cambió en otra pestaña. Conservá tus cambios como una copia antes de continuar.",
      );
  }

  private mutate(value: unknown): Promise<void> {
    const current = this.queue
      .catch(() => undefined)
      .then(async () => {
        const nextToken = crypto.randomUUID();
        await this.db.transaction("rw", this.db.meta, async () => {
          const version = (await this.db.meta.get(this.versionKey))?.value;
          if (version !== this.token)
            throw Error(
              "El borrador cambió en otra pestaña. Conservá tus cambios como una copia antes de continuar.",
            );
          if (value === undefined) await this.db.meta.delete(this.key);
          else await this.db.meta.put({ key: this.key, value });
          await this.db.meta.put({ key: this.versionKey, value: nextToken });
        });
        this.token = nextToken;
      });
    this.queue = current;
    return current;
  }
}
