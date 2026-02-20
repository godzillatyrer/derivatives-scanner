/**
 * Persistent storage layer.
 * - Uses Upstash Redis when UPSTASH_REDIS_REST_URL is set (Vercel production)
 * - Falls back to file system for local development
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

let redisClient = null;

async function getRedis() {
  if (redisClient) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;

  const { Redis } = await import('@upstash/redis');
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisClient;
}

function isRedisConfigured() {
  return !!process.env.UPSTASH_REDIS_REST_URL;
}

const DATA_DIR = join(process.cwd(), 'data');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function fileLoad(filename) {
  ensureDataDir();
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8'));
  } catch {
    return null;
  }
}

function fileSave(filename, data) {
  ensureDataDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// ── Public API ──

export async function loadState(key, defaultValue) {
  const redis = await getRedis();
  if (redis) {
    try {
      const data = await redis.get(key);
      if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (err) {
      console.error(`Redis load error for ${key}:`, err.message);
    }
  }

  // File fallback (local dev)
  const fileData = fileLoad(`${key}.json`);
  if (fileData) return fileData;

  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

export async function saveState(key, data) {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(data));
    } catch (err) {
      console.error(`Redis save error for ${key}:`, err.message);
    }
  }

  // Always also save to file if possible (local dev backup)
  try {
    fileSave(`${key}.json`, data);
  } catch {
    // File save may fail on Vercel (read-only FS) — that's fine
  }
}

export { isRedisConfigured };
