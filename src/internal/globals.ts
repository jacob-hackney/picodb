import os from "node:os";

export enum PageTypes {
  DATA = 1, // stores actual records
  LOB_HEAD = 2, // first page of a large object greater than the page size
  LOB_BODY = 3, // subsequent pages of a large object greater than the page size
  FSM = 4, // free space map, tracks free space in bytes on data pages for efficient record insertion
  BTREE_ROOT = 5, // root page of a B+ tree index, contains metadata about the index and pointers to child pages (UInt64 max record id, UInt32 internal page id)
  BTREE_INTERNAL = 6, // internal page of a B+ tree index, contains keys and pointers to child pages but no actual record data (UInt64 max record id, UInt32 leaf page id)
  BTREE_LEAF = 7, // leaf page of a B+ tree index, contains keys and pointers to data pages where the actual records are stored (UInt64 record id, UInt32 page id, UInt16 slot id)
  NAME_INDEX = 8, // special page type for the name index, which maps database and collection names to their respective indexes for more efficient data storage
  SCHEMA = 9, // page type for storing schema information, such as field names and types, for each collection in the database
}

export const PAGE_SIZE = 8192; // 8KiB

export const INTERNAL_SLOT_MAX_IDS = BigInt(Math.trunc((PAGE_SIZE - 1) / 14));
export const ROOT_SLOT_MAX_IDS = BigInt(
  Math.trunc((PAGE_SIZE - 1) / 12) * Number(INTERNAL_SLOT_MAX_IDS),
);

const oneEighthRam = os.totalmem() / 8;
const maxCacheSize = Math.floor(oneEighthRam / PAGE_SIZE);

export const CONFIG_DEFAULTS = {
  server: {
    host: "localhost",
    port: 3000,
  },
  cacheSize: Math.min(16384, maxCacheSize), // 128MiB default cache size, capped at one-eigth of system RAM
  autoRecovery: true,
  queueConcurrencyLimit: Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2))), // default to half of available CPU cores, capped at 4
  storagePath: "",
};
