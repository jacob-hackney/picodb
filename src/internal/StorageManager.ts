import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { IOQueue } from "./IOQueue.js";
import envPaths from "env-paths";

interface StorageManagerOptions {
  cacheSize?: number;
}
const OPTIONS_DEFAULTS: StorageManagerOptions = {
  cacheSize: 512,
};

export class StorageManager {
  private pageSize!: number;
  private cacheSize: number;

  private dirPath: string = envPaths("picodb", { suffix: "" }).data;
  private dbPath: string;
  private lockPath: string;

  private dbHandle!: fs.promises.FileHandle;
  private lockHandle!: fs.promises.FileHandle;
  private logHandle!: fs.promises.FileHandle;

  private operationQueue: IOQueue = new IOQueue();

  private cache: Map<number, Buffer> = new Map();

  constructor(options?: StorageManagerOptions) {
    const finalOptions = { ...OPTIONS_DEFAULTS, ...options };
    if (
      finalOptions.cacheSize! <= 0 ||
      !Number.isInteger(finalOptions.cacheSize!)
    ) {
      throw new RangeError(
        "Invalid cacheSize option. It must be a positive integer."
      );
    }
    this.cacheSize = finalOptions.cacheSize!;

    this.dbPath = path.join(this.dirPath, "pico.db");
    this.lockPath = path.join(this.dirPath, "picodb.lock");

    this.init().catch((err) => {
      throw new Error(err.message);
    });
  }

   private async init() {
    await fs.promises.access(this.dbPath).catch((err) => {
      throw new Error(
        `StorageManager initialization failed: ${err.message}${
          err.code === "ENOENT" ? "\nRun: picodb create" : ""
        }`
      );
    });

    try {
      await fs.promises.mkdir(this.dirPath, { recursive: true });
      this.dbHandle = await fs.promises.open(this.dbPath, "a+");
      this.lockHandle = await fs.promises.open(this.lockPath, "a+");
      this.logHandle = await fs.promises.open(
        path.join(this.dirPath, "picodb.binlog"),
        "a+"
      );
    } catch {
      throw new Error(
        `StorageManager failed to access files in ${
          this.dirPath
        }. Try running the process with elevated permissions(sudo).`
      );
    }
  }

  async allocatePage(): Promise<number> {
    const callerPromise = new Promise<number>(async (resolve, reject) => {
      const executionLogic = async () => {
        try {
          const stats = await this.dbHandle.stat();
          const pageIndex = Math.floor(stats.size / this.pageSize);
          const buffer = Buffer.alloc(this.pageSize);
          await this.dbHandle.write(buffer, 0, this.pageSize, stats.size);

          resolve(pageIndex);
        } catch (err) {
          reject(err);
        }
      };

      this.operationQueue.enqueue(executionLogic);
    });

    return callerPromise;
  }

  //async readPage(pageIndex: number): Promise<Buffer> {}
  //async writePage(pageIndex: number, data: Buffer): Promise<void> {}

  static async create(
    pageSizeKB: number = 64,
    overwrite: boolean = false
  ): Promise<void> {
    if (pageSizeKB <= 0 || !Number.isInteger(pageSizeKB))
      throw new RangeError(
        "Invalid pageSizeKB. It must be a positive integer."
      );

    const dirPath = envPaths("picodb", { suffix: "" }).data;

    if (
      (await fs.promises
        .opendir(dirPath)
        .then(() => true)
        .catch(() => false)) &&
      !overwrite
    ) {
      throw new Error(
        `A database already exists. To overwrite it, set the overwrite flag to true.`
      );
    }
    await fs.promises.rm(dirPath, { recursive: true, force: true });

    const dbPath = path.join(dirPath, "pico.db");
    await fs.promises.mkdir(dirPath, { recursive: true });
    const handle = await fs.promises.open(dbPath, "w+");
    await fs.promises.open(path.join(dirPath, "picodb.lock"), "w+");
    await fs.promises.open(path.join(dirPath, "picodb.binlog"), "w+");
    const pageSize = pageSizeKB * 1024;
    const initialBuffer = Buffer.alloc(pageSize);
    initialBuffer.writeUInt32LE(pageSize, 0);
    await handle.write(initialBuffer, 0, pageSize, 0);
    await handle.close();
  }
}
