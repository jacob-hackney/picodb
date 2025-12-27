import { BufferPoolManager } from "./BufferPoolManager.js";

export class FSMCalculator {
  bpm: BufferPoolManager;
  pageSize: number;

  constructor(bpm: BufferPoolManager) {
    this.bpm = bpm;
    this.pageSize = bpm.manager.header.pageSize;
  }

  async getUsedSpacePercent(pageId: number): Promise<number> {
    const fsmPageId = Math.floor(pageId / this.pageSize) * this.pageSize;
    const fsmPage = await this.bpm.getPage(fsmPageId);

    const offset = (pageId % this.pageSize);

    const usedSpacePercent = fsmPage.readUInt8(offset);
    this.bpm.unpinPage(fsmPageId);

    return usedSpacePercent;
  }

  async setUsedSpacePercent(pageId: number, usedSpacePercent: number): Promise<void> {
    const fsmPageId = Math.floor(pageId / this.pageSize) * this.pageSize;
    const fsmPage = await this.bpm.getPage(fsmPageId);

    const offset = (pageId % this.pageSize);

    fsmPage.writeUInt8(usedSpacePercent, offset);
    this.bpm.unpinPage(fsmPageId, true);
  }

  freeSpaceLeftBytes(usedSpacePercent: number): number {
    return (100 - usedSpacePercent) * this.pageSize;
  }
}
