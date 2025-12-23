import { Buffer } from "node:buffer";
import { StorageManager, StorageManagerOptions } from "./StorageManager.js";

export class BufferPoolManager {
  cache: Map<number, Buffer> = new Map();
  historyList: Map<number, Buffer> = new Map();
  dirtyList: Map<number, boolean> = new Map();
  pinCounts: Map<number, number> = new Map();

  cacheSize: number;
  historyListSize: number;

  manager: StorageManager;

  constructor(size: number = 128, storageManagerOptions?: StorageManagerOptions) {
    if (size < 4 || !Number.isInteger(size))
      throw new RangeError(
        `size must be an integer greater than or equal to 4. Received ${size}`
      );
    const oneFourth = Math.floor(size / 4);
    this.cacheSize = oneFourth * 3;
    this.historyListSize = oneFourth;
    this.manager = new StorageManager(storageManagerOptions);
  }

  async createPage() {
    const pageId = await this.manager.allocatePage();
    if (this.historyList.size >= this.historyListSize)
      await this.evictFromHistory();

    const buffer = Buffer.alloc(this.manager.pageSize);
    this.historyList.set(pageId, buffer);

    this.pinCounts.set(pageId, 1);
    this.dirtyList.set(pageId, true);

    return { pageId, buffer };
  }

  async getPage(pageId: number): Promise<Buffer> {
    this.pinCounts.set(pageId, (this.pinCounts.get(pageId) ?? 0) + 1);

    if (this.cache.has(pageId)) {
      const data = this.cache.get(pageId)!;
      this.cache.delete(pageId);
      this.cache.set(pageId, data);
      return data;
    }

    if (this.historyList.has(pageId)) {
      if (this.cache.size >= this.cacheSize) {
        await this.evictFromCache();
      }

      const data = this.historyList.get(pageId);
      this.cache.set(pageId, data!);
      this.historyList.delete(pageId);
      return data!;
    }

    if (this.historyList.size >= this.historyListSize) {
      await this.evictFromHistory();
    }

    this.historyList.set(pageId, await this.manager.readPage(pageId));
    return this.historyList.get(pageId)!;
  }

  unpinPage(pageId: number, isDirty: boolean = false): void {
    const count = this.pinCounts.get(pageId) ?? 0;
    if (count > 0) this.pinCounts.set(pageId, count - 1);
    if (isDirty) this.dirtyList.set(pageId, true);
  }

  async evictFromHistory(): Promise<void> {
    const iterator = this.historyList.keys();
    let result = iterator.next();

    while (!result.done) {
      const victimId = result.value;

      if ((this.pinCounts.get(victimId) ?? 0) > 0) {
        result = iterator.next();
        continue;
      }

      if (this.dirtyList.get(victimId)) {
        const data = this.historyList.get(victimId)!;
        await this.manager.writePage(victimId, data);
        this.dirtyList.delete(victimId);
      }

      this.historyList.delete(victimId);
      this.pinCounts.delete(victimId);
      return;
    }

    throw new Error("Buffer Pool Overflow: All pages in history are pinned.");
  }

  async evictFromCache(): Promise<void> {
    const iterator = this.cache.keys();
    let result = iterator.next();

    while (!result.done) {
      const victimId = result.value;

      if ((this.pinCounts.get(victimId) ?? 0) > 0) {
        result = iterator.next();
        continue;
      }

      if (this.dirtyList.get(victimId)) {
        const data = this.cache.get(victimId)!;
        await this.manager.writePage(victimId, data);
        this.dirtyList.delete(victimId);
      }

      this.cache.delete(victimId);
      this.pinCounts.delete(victimId);
      return;
    }

    throw new Error("Buffer Pool Overflow: All pages in cache are pinned.");
  }

  async flushAll(): Promise<void> {
    const allEntries = [...this.historyList.entries(), ...this.cache.entries()];

    for (const [pageId, buffer] of allEntries) {
      if (this.dirtyList.get(pageId)) {
        this.manager.writePage(pageId, buffer);
        this.dirtyList.set(pageId, false);
      }
    }
  }
}
