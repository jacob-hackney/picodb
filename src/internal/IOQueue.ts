type DBOperation<T> = () => Promise<T>;

export class IOQueue {
  private pending: DBOperation<any>[] = [];
  private runningCount: number = 0;
  private isProcessing: boolean = false;
  private isReady: boolean = false;

  async enqueue<T>(operation: DBOperation<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => operation().then(resolve).catch(reject);
      this.pending.push(task);

      if (!this.isProcessing && this.isReady) this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.pending.length > 0 && this.runningCount < 16) {
      for (const task of this.pending.splice(0, 16 - this.runningCount)) {
        this.runningCount++;
        task().finally(() => {
          this.runningCount--;
          if (!this.isProcessing && this.isReady) this.processQueue();
        });
      }
    }

    this.isProcessing = false;
  }

  start(): void {
    this.processQueue();
    this.isReady = true;
  }
}
