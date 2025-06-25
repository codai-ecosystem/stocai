import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/lib/database';
import { redis } from '../src/lib/redis';

describe('STOCAI Service - Unit Tests', () => {
  beforeEach(async () => {
    // Clear database and redis before each test
    if (db) {
      await db.migrate.latest();
      await db.seed.run();
    }
    if (redis) {
      await redis.flushall();
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (db) {
      await db.migrate.rollback();
    }
    if (redis) {
      await redis.flushall();
    }
  });

  describe('Health Checks', () => {
    it('should return 200 for health endpoint', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'stocai',
        timestamp: expect.any(String),
        version: expect.any(String),
      });
    });

    it('should return 200 for readiness endpoint', async () => {
      const response = await request(app).get('/ready').expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        service: 'stocai',
        dependencies: expect.any(Object),
      });
    });

    it('should return metrics endpoint', async () => {
      const response = await request(app).get('/metrics').expect(200);

      expect(response.text).toContain('# HELP');
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('API Endpoints', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.body).toMatchObject({
        service: 'stocai',
        version: expect.any(String),
        environment: expect.any(String),
      });
    });

    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.any(String),
      });
    });

    it('should validate request headers', async () => {
      const response = await request(app)
        .get('/api/v1/info')
        .set('User-Agent', 'Test Agent')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      // Mock a server error
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .post('/api/v1/test-error')
        .send({ trigger: 'error' });

      expect([400, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate request body', async () => {
      const response = await request(app)
        .post('/api/v1/validate')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.any(Array),
      });
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app).get('/api/v1/protected').expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.any(String),
      });
    });

    it('should accept requests with valid authentication', async () => {
      const token = 'test-valid-token'; // Mock token

      const response = await request(app)
        .get('/api/v1/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const endpoint = '/api/v1/rate-limited';

      // Make multiple requests quickly
      const requests = Array(10)
        .fill()
        .map(() => request(app).get(endpoint));

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Database Operations', () => {
    it('should connect to database successfully', async () => {
      if (db) {
        const result = await db.raw('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
      }
    });

    it('should handle database errors gracefully', async () => {
      if (db) {
        try {
          await db.raw('SELECT * FROM non_existent_table');
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Cache Operations', () => {
    it('should connect to Redis successfully', async () => {
      if (redis) {
        await redis.set('test-key', 'test-value');
        const value = await redis.get('test-key');
        expect(value).toBe('test-value');
      }
    });

    it('should handle cache misses gracefully', async () => {
      if (redis) {
        const value = await redis.get('non-existent-key');
        expect(value).toBeNull();
      }
    });
  });

  describe('Performance', () => {
    it('should respond to health checks quickly', async () => {
      const start = Date.now();
      await request(app).get('/health').expect(200);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should respond in less than 1 second
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = 5;
      const requests = Array(concurrentRequests)
        .fill()
        .map(() => request(app).get('/health'));

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});
