import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { IOQueue } from "./internal/IOQueue.js";

interface StorageManagerOptions {
  cacheSize?: number;
}
const OPTIONS_DEFAULTS: StorageManagerOptions = {
  cacheSize: 512,
};

/**
 * Manages storage of data in a file with paging and caching capabilities.
 * @class StorageManager
 */
export class StorageManager {
  #pageSize!: number;
  #cacheSize: number;

  #dirPath: string;
  #dbPath: string;
  #lockPath: string;

  #dbHandle!: fs.promises.FileHandle;
  #lockHandle!: fs.promises.FileHandle;
  #logHandle!: fs.promises.FileHandle;

  #initQueue: Promise<any>[] = [];
  #operationQueue: IOQueue = new IOQueue();
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
    await fs.promises.access(this.#dbPath).catch((err) => {
      throw new Error(
        `StorageManager initialization failed: ${err.message}${
          err.code === "ENOENT" ? "\nRun: picodb create" : ""
        }`
      );
    });

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
  }

  /**
   * Creates a new page in the storage file.
   * @returns {Promise<number>} The page index of the newly created page
   */
  async allocatePage(): Promise<number> {
    const callerPromise = new Promise<number>(async (resolve, reject) => {
      const executionLogic = async () => {
        try {
          const stats = await this.#dbHandle.stat();
          const pageIndex = Math.floor(stats.size / this.#pageSize);
          const buffer = Buffer.alloc(this.#pageSize);
          await this.#dbHandle.write(buffer, 0, this.#pageSize, stats.size);

          resolve(pageIndex);
        } catch (err) {
          reject(err);
        }
      };

      if (this.#ready) {
        this.#operationQueue.enqueue(executionLogic);
      } else {
        this.#initQueue.push(executionLogic());
      }
    });

    return callerPromise;
  }

  //async readPage(pageIndex: number): Promise<Buffer> {}
  //async writePage(pageIndex: number, data: Buffer): Promise<void> {}

  static async create(
    dirPath: string = "~/.picodb",
    pageSizeKB: number = 64,
    overwrite: boolean = false
  ): Promise<void> {
    if (pageSizeKB <= 0 || !Number.isInteger(pageSizeKB)) {
      throw new RangeError(
        "Invalid pageSizeKB. It must be a positive integer."
      );
    }

    const resolvedDirPath = path.resolve(
      dirPath.replace(/^~(?=$|\/|\\)/, os.homedir())
    );

    if (resolvedDirPath === path.sep)
      throw new Error("Refusing to create database in root directory.");

    if (
      (await fs.promises
        .opendir(resolvedDirPath)
        .then(() => true)
        .catch(() => false)) &&
      !overwrite
    ) {
      throw new Error(
        `Directory ${resolvedDirPath} already exists. To overwrite, set the overwrite flag to true.`
      );
    }
    await fs.promises.rm(resolvedDirPath, { recursive: true, force: true });

    const dbPath = path.join(resolvedDirPath, "pico.db");
    await fs.promises.mkdir(resolvedDirPath, { recursive: true });
    const handle = await fs.promises.open(dbPath, "w+");
    await fs.promises.open(path.join(resolvedDirPath, "picodb.lock"), "w+");
    await fs.promises.open(path.join(resolvedDirPath, "picodb.binlog"), "w+");
    const pageSize = pageSizeKB * 1024;
    const initialBuffer = Buffer.alloc(pageSize);
    initialBuffer.writeUInt32LE(pageSize, 0);
    await handle.write(initialBuffer, 0, pageSize, 0);
    await handle.close();
  }
}
