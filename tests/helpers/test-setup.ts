import { db } from '../../src/lib/database';
import { redis } from '../../src/lib/redis';

export async function setupTestEnvironment() {
  console.log('🧪 Setting up test environment...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL =
    process.env.TEST_REDIS_URL || 'redis://localhost:6379';

  // Setup database
  if (db) {
    try {
      await db.migrate.latest();
      await db.seed.run();
      console.log('✅ Database setup complete');
    } catch (error) {
      console.error('❌ Database setup failed:', error);
      throw error;
    }
  }

  // Setup Redis
  if (redis) {
    try {
      await redis.ping();
      await redis.flushall();
      console.log('✅ Redis setup complete');
    } catch (error) {
      console.error('❌ Redis setup failed:', error);
      throw error;
    }
  }

  console.log('✅ Test environment setup complete');
}

export async function teardownTestEnvironment() {
  console.log('🧹 Tearing down test environment...');

  // Cleanup database
  if (db) {
    try {
      await db.migrate.rollback();
      await db.destroy();
      console.log('✅ Database cleanup complete');
    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
    }
  }

  // Cleanup Redis
  if (redis) {
    try {
      await redis.flushall();
      await redis.quit();
      console.log('✅ Redis cleanup complete');
    } catch (error) {
      console.error('❌ Redis cleanup failed:', error);
    }
  }

  console.log('✅ Test environment teardown complete');
}

export function createMockData(type: string, overrides: any = {}) {
  const mockData = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    },
    operation: {
      id: 'op-123',
      type: 'test-operation',
      status: 'pending',
      data: { test: true },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    },
  };

  return mockData[type] || {};
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await delay(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

export function createTestServer(port = 0) {
  const express = require('express');
  const app = express();

  app.use(express.json());

  // Basic test endpoints
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
  });

  app.get('/ready', (req, res) => {
    res.json({ status: 'ready' });
  });

  app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('# HELP test_metric Test metric\ntest_metric 1\n');
  });

  return new Promise(resolve => {
    const server = app.listen(port, () => {
      resolve({
        app,
        server,
        port: server.address().port,
        close: () => server.close(),
      });
    });
  });
}
