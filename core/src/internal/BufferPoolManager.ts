import { Buffer } from "node:buffer";

import { StorageManager } from "./StorageManager.js";
import type { Config, IBufferPoolManager, IStorageManager } from "./types.js";
import { PAGE_SIZE, PageTypes } from "./globals.js";

export class BufferPoolManager implements IBufferPoolManager {
  readonly slab: Buffer;
  availableOffsets: number[];
  pageIdMap: Map<number, number> = new Map();
  dirtyList: Map<number, boolean> = new Map();
  pinCounts: Map<number, number> = new Map();
  cacheSize: number;

  manager: StorageManager;

  constructor(config: Config) {
    this.cacheSize = config.cacheSize;
    this.slab = Buffer.allocUnsafeSlow(this.cacheSize * PAGE_SIZE);
    this.availableOffsets = Array.from(
      { length: this.cacheSize },
      (_, i) => this.cacheSize - 1 - i,
    );

    this.manager = new StorageManager(config);
  }

  async getPage(id: number): Promise<Buffer> {
    const offset = this.pageIdMap.get(id);
    if (offset) {
      this.pinCounts.set(id, this.pinCounts.get(id)! + 1);
      this.pageIdMap.delete(id);
      this.pageIdMap.set(id, offset);
      return this.slab.subarray(offset, offset + PAGE_SIZE);
    } else {
      if (
        this.availableOffsets.length === 0 ||
        this.pageIdMap.size >= this.cacheSize
      )
        this.evictOldest();

      const newOffset = this.availableOffsets.pop();
      const page = await this.manager.readPage(id);

      this.slab.set(page, newOffset);
      this.pageIdMap.set(id, newOffset!);

      this.pinCounts.set(id, 1);
      this.dirtyList.set(id, false);

      return this.slab.subarray(newOffset, newOffset! + PAGE_SIZE);
    }
  }

  unpinPage(id: number, isDirty: boolean = false): number {
    const currentPinCount = this.pinCounts.get(id);

    if (currentPinCount === undefined) return 0;

    if (currentPinCount === 0) {
      if (isDirty) this.dirtyList.set(id, true);
      return 0;
    } else {
      if (isDirty) this.dirtyList.set(id, true);
      this.pinCounts.set(id, currentPinCount - 1);
      return currentPinCount - 1;
    }
  }

  async allocatePage(pageType: keyof typeof PageTypes): Promise<Buffer> {
    const { buffer: page, pageId } = await this.manager.allocatePage(pageType);

    if (this.availableOffsets.length === 0) this.evictOldest();

    const newOffset = this.availableOffsets.pop();

    this.slab.set(page, newOffset);
    this.pageIdMap.set(pageId, newOffset!);

    this.pinCounts.set(pageId, 1);
    this.dirtyList.set(pageId, false);

    return this.slab.subarray(newOffset, newOffset! + PAGE_SIZE);
  }

  async evictOldest(force: boolean = false): Promise<number> {
    const iterator = this.pageIdMap.keys();
    let i = iterator.next();

    while (!i.done) {
      const pageId = i.value;

      if (this.pinCounts.get(pageId) === 0 || force) {
        const offset = this.pageIdMap.get(pageId)!;
        if (this.dirtyList.get(pageId) === true) {
          await this.manager.writePage(
            pageId,
            this.slab.subarray(offset, offset + PAGE_SIZE),
          );
        }
        this.availableOffsets.push(offset);
        this.pageIdMap.delete(pageId);
        this.dirtyList.delete(pageId);
        this.pinCounts.delete(pageId);

        return pageId;
      } else {
        i = iterator.next();
      }
    }

    console.warn("Failed to evict page from cache; no available pages.");
    return -1;
  }

  async flush(forceEviction: boolean = false): Promise<void> {
    for (let i = 1; i <= this.pageIdMap.size; i++) {
      await this.evictOldest(forceEviction);
    }
  }
}
