import type { FileHandle } from "node:fs/promises";
import fs from "node:fs";
import { homedir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

import type { AllocatedPage, Config, IStorageManager } from "./types.js";
import {
  CONFIG_DEFAULTS,
  INTERNAL_SLOT_MAX_IDS,
  PAGE_SIZE,
  PageTypes,
  ROOT_SLOT_MAX_IDS,
} from "./globals.js";
import { IOQueue } from "./IOQueue.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

async function testPathExist(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return false;
    }
  }

  return true;
}

export class StorageManager implements IStorageManager {
  handle!: FileHandle;
  ioQueue: IOQueue;

  constructor(config: Config) {
    this.ioQueue = new IOQueue(config);

    const path = config.storagePath
      ? nodePath.resolve(
          nodePath.join(config.storagePath.replace(/$~/, homedir()), ".picodb"),
        )
      : `${homedir()}/.picodb`;

    this.init(path);
  }

  async init(path: string): Promise<void> {
    this.handle = await fs.promises.open(
      nodePath.join(path, "data", "main.pdb"),
      "r+",
    );

    this.ioQueue.start();
  }

  async readPage(page: number): Promise<Buffer> {
    return await this.ioQueue.addTask(async () => {
      const buffer = Buffer.allocUnsafe(PAGE_SIZE);
      await this.handle.read(buffer, 0, PAGE_SIZE, page * PAGE_SIZE);

      return buffer;
    });
  }

  async writePage(page: number, data: Buffer): Promise<void> {
    await this.ioQueue.addTask(async () => {
      await this.handle.write(data, 0, PAGE_SIZE, page * PAGE_SIZE);
    });
  }

  async allocatePage(pageType: keyof typeof PageTypes): Promise<AllocatedPage> {
    return await this.ioQueue.addTask(async () => {
      const buffer = Buffer.alloc(PAGE_SIZE);
      buffer.writeUInt8(PageTypes[pageType], 0);
      if (pageType === "DATA") {
        buffer.writeUInt16LE(5, 1); // the free space bottom variable, where to write a new record
        buffer.writeUInt16LE(PAGE_SIZE - 4, 3); // the free space top variable, where to write a new slot
      }
      const fileSize = await this.getFileSize("B");
      await this.handle.write(buffer, 0, PAGE_SIZE, fileSize);

      return { buffer, pageId: fileSize / PAGE_SIZE };
    });
  }

  async getFileSize(dataUnit: "B" | "KB" | "MB" | "GB"): Promise<number> {
    const stats = await this.handle.stat();
    const sizeInBytes = stats.size;

    switch (dataUnit) {
      case "B":
        return sizeInBytes;
      case "KB":
        return sizeInBytes / 1024;
      case "MB":
        return sizeInBytes / (1024 * 1024);
      case "GB":
        return sizeInBytes / (1024 * 1024 * 1024);
      default:
        return NaN;
    }
  }

  // variables for tracking progress of database creation
  private static PROGRESS_STEPS = 4 + 8 + 3 + 2; // 3 steps for verification + 8 steps for data dir + 3 steps for log dir + 2 steps for config dir
  private static currentProgress = 0;

  // creates the database files, only meant for use with cli commands
  static async createDatabaseFiles(
    path: string,
    progressUpdater: (percent: number, message: string) => void,
  ): Promise<void> {
    progressUpdater(0, "Resolving path...");
    path = path
      ? nodePath.resolve(
          nodePath.join(path.replace(/$~/, homedir()), ".picodb"),
        )
      : nodePath.join(homedir(), ".picodb");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Checking if database already exists...",
    );
    if (await testPathExist(path)) {
      process.stdout.write("\n");
      throw new Error(
        `Database at "${path}" already exists. Please use "picodb hard-reset" (not implemented yet) or delete the existing file/directory before creating a new database.`,
      );
    }

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating database directory...",
    );
    await fs.promises.mkdir(path);

    await this.createDataDirectory(path, progressUpdater);
    await this.createLogDirectory(path, progressUpdater);
    await this.createConfigDirectory(path, progressUpdater, CONFIG_DEFAULTS);

    progressUpdater(
      1,
      `PicoDB initialized successfully at "${path}".`,
    );
  }

  // #region DB Creation Helpers
  private static async createDataDirectory(
    path: string,
    progressUpdater: (progress: number, message: string) => void,
  ): Promise<void> {
    const dataPath = nodePath.join(path, "data");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating data directory...",
    );
    await fs.promises.mkdir(dataPath);

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating main database file...",
    );
    await fs.promises.writeFile(nodePath.join(dataPath, "main.pdb"), "");

    const tempMgr = new StorageManager({
      ...CONFIG_DEFAULTS,
      storagePath: nodePath.resolve(nodePath.join(path, "..")),
    });

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing FSM page (page 0)...",
    );
    await tempMgr.allocatePage("FSM");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing name index page (page 1)...",
    );
    await tempMgr.allocatePage("NAME_INDEX");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing schema page (page 2)...",
    );
    await tempMgr.allocatePage("SCHEMA");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing B+ tree root page (page 3)...",
    );
    const { buffer: bRoot } = await tempMgr.allocatePage("BTREE_ROOT");
    bRoot.writeBigUInt64LE(ROOT_SLOT_MAX_IDS, 1);
    bRoot.writeUInt32LE(4, 9); // pointer to internal page
    await tempMgr.writePage(3, bRoot);

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing B+ tree internal page (page 4)...",
    );
    const { buffer: bInternal } = await tempMgr.allocatePage("BTREE_INTERNAL");
    bInternal.writeBigUInt64LE(INTERNAL_SLOT_MAX_IDS, 1);
    bInternal.writeUInt32LE(5, 9); // pointer to leaf page
    await tempMgr.writePage(4, bInternal);

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing B+ tree leaf page (page 5)...",
    );
    await tempMgr.allocatePage("BTREE_LEAF");
  }

  private static async createLogDirectory(
    path: string,
    progressUpdater: (percent: number, message: string) => void,
  ): Promise<void> {
    const logPath = nodePath.join(path, "log");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating log directory...",
    );
    await fs.promises.mkdir(logPath);

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Initializing logger...",
    );
    const tempLogger = winston.createLogger({
      level: "info",
      transports: [
        new DailyRotateFile({
          filename: nodePath.join(logPath, "picodb-%DATE%.log"),
          datePattern: "DD-MM-YYYY",
          maxSize: "20m",
          maxFiles: "14d",
        }),
      ],
    });

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating initial log entry...",
    );
    tempLogger.info("PicoDB logs initialized.");

    tempLogger.end();
  }

  private static async createConfigDirectory(path: string, progressUpdater: (percent: number, message: string) => void, config: Config): Promise<void> {
    const configPath = nodePath.join(path, "config");

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating config directory...",
    );
    await fs.promises.mkdir(configPath);

    progressUpdater(
      (++this.currentProgress / this.PROGRESS_STEPS),
      "Creating initial config file...",
    );
    await fs.promises.writeFile(nodePath.join(configPath, "config.json"), JSON.stringify({ $schema: "https://raw.githubusercontent.com/jacob-hackney/picodb/refs/heads/main/src/internal/config-schema.json", ...config }, null, 2));
  }
  // #endregion DB Creation Helpers
}
