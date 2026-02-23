import type { Config, IIOQueue } from "./types.js";

export class IOQueue implements IIOQueue {
  concurrencyLimit: number = 4;
  ready: boolean = false;
  isActive: boolean = false;
  processCount: number = 0;
  queue: (() => Promise<any>)[] = [];

  constructor(config: Config) {
    this.concurrencyLimit = config.queueConcurrencyLimit > 0 ? config.queueConcurrencyLimit : Infinity;
  }

  start() {
    this.ready = true;
    this.isActive = true;

    while (this.queue.length > 0 && this.processCount < this.concurrencyLimit) {
      const task = this.queue.shift();
      if (task) {
        this.processCount++;
        task().then(() => {
          this.processCount--;
          if (this.queue.length > 0 && !this.isActive) this.start();
        });
      }
    }

    this.isActive = false;
  }

  async addTask<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      if(this.ready && !this.isActive) this.start();
    });
  }
}
