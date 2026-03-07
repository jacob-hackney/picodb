import fs from "node:fs";
import path from "node:path";

import type { ILockManager } from "./types.js";

export class LockManager implements ILockManager {
  locks: Map<number, "S" | "X"> = new Map();
  sharedLockQuantity: Map<number, number> = new Map();
  queues: Map<number, { type: "S" | "X"; func: () => void; }[]> = new Map();

  async acquireProcessLock(dbPath: string): Promise<void> {
    const lockFilePath = path.resolve(path.join(dbPath, ".picodb", "data", "picodb.lock"));

    await fs.promises.writeFile(lockFilePath, process.pid.toString(), { flag: "wx" });
  }

  async releaseProcessLock(dbPath: string): Promise<void> {
    const lockFilePath = path.resolve(path.join(dbPath, ".picodb", "data", "picodb.lock"));

    // make sure the lock file exists and belongs to the current process
    if((await fs.promises.readFile(lockFilePath)).toString() === process.pid.toString()) {
      await fs.promises.unlink(lockFilePath);
    } else {
      throw new Error("Cannot release lock: lock file does not belong to the current process.");
    }
  }

  async acquireLock(pageId: number, lockType: "S" | "X"): Promise<void> {
    const currentLock = this.locks.get(pageId);

    if (!currentLock) {
      this.locks.set(pageId, lockType);
      if (lockType === "S") this.sharedLockQuantity.set(pageId, 1);
      return;
    }

    if (currentLock === "S" && lockType === "S") {
      this.sharedLockQuantity.set(
        pageId,
        this.sharedLockQuantity.get(pageId)! + 1,
      );
      return;
    }

    await new Promise<void>((resolve) => {
      const queue = this.queues.get(pageId) ?? [];
      queue.push({ type: lockType, func: resolve });
      this.queues.set(pageId, queue);
    });
  }

  releaseLock(pageId: number): void {
    const currentLock = this.locks.get(pageId);
    if (!currentLock) return;

    if (currentLock === "S") {
      const sharedCount = this.sharedLockQuantity.get(pageId)! - 1;
      if (sharedCount === 0) {
        this.locks.delete(pageId);
        this.sharedLockQuantity.delete(pageId);
      } else {
        this.sharedLockQuantity.set(pageId, sharedCount);
      }
    } else {
      this.locks.delete(pageId);
    }

    const queue = this.queues.get(pageId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      this.queues.set(pageId, queue);
      this.acquireLock(pageId, next.type).then(next.func);
    }
  }
}
