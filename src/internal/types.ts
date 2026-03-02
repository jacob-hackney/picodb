import type { FileHandle } from "node:fs/promises";
import type { Buffer } from "node:buffer";

import { PageTypes } from "./globals.js";

export interface Config {
  cacheSize: number;
  queueConcurrencyLimit: number;
  storagePath: string;
}

// #region IOQueue
export interface IIOQueue {
  // variable indicating concurrency limit for the queue, default is 4
  concurrencyLimit: number;

  // variable indicating the ready state
  ready: boolean;

  // variable indicating if the queue is currently looping through the queue to process tasks
  isActive: boolean;

  // variable indicating the amount of tasks currrently being processed
  processCount: number;

  // the fifo queue, with a concurrency limit of 4 (configurable)
  queue: (() => Promise<any>)[];

  // starts the queue
  start(): void;

  // adds a task to the queue and returns a promise that resolves when the task is complete
  addTask<T>(task: () => Promise<T>): Promise<T>;
}
// #endregion IOQueue

// #region StorageManager
export interface AllocatedPage {
  buffer: Buffer;
  pageId: number;
}

export interface IStorageManager {
  // the fs promises file handle for the database file
  handle: FileHandle;

  // the queue for managing concurrent read/write operations to the database file
  ioQueue: IIOQueue;

  // reads a page and returns page data as a buffer
  readPage(page: number): Promise<Buffer>;

  // writes data to a page
  writePage(page: number, data: Buffer): Promise<void>;

  // adds a new page to the database and returns page data as a buffer
  allocatePage(pageType: keyof typeof PageTypes): Promise<AllocatedPage>;

  // returns total file size in bytes
  getFileSize(dataUnit: "B" | "KB" | "MB" | "GB"): Promise<number>;

  // the async constructor for the storage manager, which initializes the database file handle
  init(path: string): Promise<void>;
}
// #endregion StorageManager

// #region BufferPoolManager
export interface IBufferPoolManager {
  readonly slab: Buffer; // the cache, one big buffer to reduce overhead
  availableOffsets: number[];
  pageIdMap: Map<number, number>; // page id, offset
  dirtyList: Map<number, boolean>; // page id, t/f
  pinCounts: Map<number, number>; // page id, pin amount
  cacheSize: number;

  manager: IStorageManager;

  getPage(id: number): Promise<Buffer>;

  unpinPage(id: number, isDirty?: boolean): number; // returns the new pin count

  allocatePage(pageType: keyof typeof PageTypes): Promise<Buffer>;

  evictOldest(force: boolean): Promise<number>; // returns page id of evicted page

  flush(forceEviction: boolean): Promise<void>;
}
//#endregion BufferPoolManager
