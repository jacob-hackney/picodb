import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface StorageManagerOptions {
  pageSize?: number;
  cacheSize?: number;
}
const OPTIONS_DEFAULTS: StorageManagerOptions = {
  pageSize: 64,
  cacheSize: 128,
};

/**
 * Manages storage of data in a file with paging and caching capabilities.
 * @class StorageManager
 */
export class StorageManager {
  #pageSize: number;
  #cacheSize: number;

  #dirPath: string;
  #dbPath: string;
  #lockPath: string;

  #dbHandle: fs.promises.FileHandle =
    undefined as unknown as fs.promises.FileHandle;
  #lockHandle: fs.promises.FileHandle =
    undefined as unknown as fs.promises.FileHandle;
  #logHandle: fs.promises.FileHandle =
    undefined as unknown as fs.promises.FileHandle;

  #initQueue: Promise<any>[] = [];
  #operationQueue: Promise<any>[] = [];
  #ready: boolean = false;

  #cache: Map<number, Buffer> = new Map();

  /**
   * Creates an instance of StorageManager. Pages, referenced in `options.pageSize`, are the data chunks used for reading and writing to the storage file.
   * @constructs StorageManager
   * @param {string} [dirPath="~/.picodb"] Directory path for storage files.
   * @param {StorageManagerOptions} [options] Configuration options for the storage manager.
   * @param {number} [options.pageSize=64] Size of each page in kilobytes.
   * @param {number} [options.cacheSize=128] Number of pages to cache in memory. **With default values**, the cache will use at most 8MB of memory.
   * @throws Will throw an error if the storage directory or files cannot be accessed.
   */
  constructor(dirPath: string = "~/.picodb", options?: StorageManagerOptions) {
    const finalOptions = { ...OPTIONS_DEFAULTS, ...options };
    this.#pageSize = finalOptions.pageSize! * 1024;
    if (this.#pageSize <= 0 || !Number.isInteger(this.#pageSize)) {
      throw new RangeError(
        "Invalid pageSize option. It must positive and have an integer byte size(pageSize * 1024)."
      );
    }
    if (
      finalOptions.cacheSize! <= 0 ||
      !Number.isInteger(finalOptions.cacheSize!)
    ) {
      throw new RangeError(
        "Invalid cacheSize option. It must be a positive integer."
      );
    }
    this.#cacheSize = finalOptions.cacheSize!;

    this.#dirPath = path.resolve(
      dirPath.replace(/^~(?=$|\/|\\)/, os.homedir())
    );
    this.#dbPath = path.join(this.#dirPath, "pico.db");
    this.#lockPath = path.join(this.#dirPath, "picodb.lock");

    this.#init().catch((err) => {
      throw new Error(err.message);
    });
  }

  async #init() {
    const exists = await fs.promises.access(this.#dbPath).then(
      () => true,
      () => false
    );

    try {
      await fs.promises.mkdir(this.#dirPath, { recursive: true });
      this.#dbHandle = await fs.promises.open(this.#dbPath, "a+");
      this.#lockHandle = await fs.promises.open(this.#lockPath, "a+");
      this.#logHandle = await fs.promises.open(
        path.join(this.#dirPath, "picodb.binlog"),
        "a+"
      );
    } catch {
      throw new Error(
        `StorageManager failed to access files in ${
          this.#dirPath
        }. Try running the process with elevated permissions(sudo).`
      );
    }

    if (!exists) {
      await this.allocatePage();
    }

    this.#ready = true;
  }
}
