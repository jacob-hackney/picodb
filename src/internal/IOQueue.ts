export class IOQueue {
  #operationQueue: Promise<any>[] = [];

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const lastOperation =
      this.#operationQueue.length > 0
        ? this.#operationQueue[this.#operationQueue.length - 1]
        : Promise.resolve();

    const newOperation = lastOperation.then(() => operation());
    this.#operationQueue.push(newOperation);

    newOperation.finally(() => {
      this.#operationQueue = this.#operationQueue.filter(
        (op) => op !== newOperation
      );
    });

    return newOperation;
  }
}
