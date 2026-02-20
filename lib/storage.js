/**
 * Persistent storage layer.
 * - Uses Upstash Redis when UPSTASH_REDIS_REST_URL is set (Vercel production)
 * - Falls back to file system for local development only
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

// ── File system (local dev only) ──

const DATA_DIR = join(process.cwd(), 'data');

function fileLoad(filename) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8'));
  } catch {
    return null;
  }
}

function fileSave(filename, data) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
  } catch {
    // Silently fail — filesystem is read-only on Vercel
  }
}

// ── Public API ──

export async function loadState(key, defaultValue) {
  // Redis path (Vercel production)
  if (isRedisConfigured()) {
    const redis = await getRedis();
    try {
      const data = await redis.get(key);
      if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (err) {
      console.error(`Redis load error for ${key}:`, err.message);
    }
    // Key doesn't exist in Redis yet — return default, skip file system
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  }

  // File system path (local dev only)
  const fileData = fileLoad(`${key}.json`);
  if (fileData) return fileData;

  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

export async function saveState(key, data) {
  // Redis path (Vercel production)
  if (isRedisConfigured()) {
    const redis = await getRedis();
    try {
      await redis.set(key, JSON.stringify(data));
    } catch (err) {
      console.error(`Redis save error for ${key}:`, err.message);
    }
    return;
  }

  // File system path (local dev only)
  fileSave(`${key}.json`, data);
}

export { isRedisConfigured };
