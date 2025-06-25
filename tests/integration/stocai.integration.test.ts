import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/lib/database';
import { redis } from '../src/lib/redis';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './helpers/test-setup';

describe('STOCAI Service - Integration Tests', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    // Reset state before each test
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
  });

  describe('End-to-End Workflows', () => {
    it('should complete a full user workflow', async () => {
      // Step 1: Create a user session
      const authResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword',
        })
        .expect(200);

      const { token } = authResponse.body;
      expect(token).toBeDefined();

      // Step 2: Use authenticated endpoint
      const userResponse = await request(app)
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(userResponse.body).toMatchObject({
        id: expect.any(String),
        email: 'test@example.com',
      });

      // Step 3: Perform business logic operation
      const operationResponse = await request(app)
        .post('/api/v1/operations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'test-operation',
          data: { test: true },
        })
        .expect(201);

      expect(operationResponse.body).toMatchObject({
        id: expect.any(String),
        status: 'completed',
      });

      // Step 4: Verify operation was recorded
      const historyResponse = await request(app)
        .get('/api/v1/user/operations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(historyResponse.body.operations).toHaveLength(1);
      expect(historyResponse.body.operations[0]).toMatchObject({
        type: 'test-operation',
        status: 'completed',
      });
    });

    it('should handle complex data workflows', async () => {
      // Test data processing pipeline
      const data = {
        input: 'test data',
        options: {
          process: true,
          validate: true,
        },
      };

      const response = await request(app)
        .post('/api/v1/process')
        .send(data)
        .expect(200);

      expect(response.body).toMatchObject({
        processed: true,
        validated: true,
        output: expect.any(String),
      });
    });
  });

  describe('Service Integration', () => {
    it('should integrate with external services', async () => {
      // Mock external service call
      const externalResponse = await request(app)
        .post('/api/v1/external/sync')
        .send({ action: 'sync' })
        .expect(200);

      expect(externalResponse.body).toMatchObject({
        synced: true,
        timestamp: expect.any(String),
      });
    });

    it('should handle service failures gracefully', async () => {
      // Test circuit breaker pattern
      const response = await request(app)
        .post('/api/v1/external/failing-service')
        .send({ test: true })
        .expect(503);

      expect(response.body).toMatchObject({
        error: 'Service Unavailable',
        retry_after: expect.any(Number),
      });
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency across operations', async () => {
      // Test transaction handling
      const data = {
        operations: [
          { type: 'create', entity: 'user', data: { name: 'Test User' } },
          { type: 'create', entity: 'profile', data: { userId: 'user-id' } },
        ],
      };

      const response = await request(app)
        .post('/api/v1/batch-operations')
        .send(data)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        operations_completed: 2,
      });

      // Verify both entities were created
      const userResponse = await request(app).get('/api/v1/users').expect(200);

      expect(userResponse.body.users).toHaveLength(1);
    });

    it('should rollback failed transactions', async () => {
      // Test transaction rollback
      const data = {
        operations: [
          { type: 'create', entity: 'user', data: { name: 'Test User' } },
          { type: 'create', entity: 'invalid', data: { invalid: true } }, // This should fail
        ],
      };

      const response = await request(app)
        .post('/api/v1/batch-operations')
        .send(data)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Transaction Failed',
        operations_completed: 0,
      });

      // Verify no entities were created
      const userResponse = await request(app).get('/api/v1/users').expect(200);

      expect(userResponse.body.users).toHaveLength(0);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high throughput', async () => {
      const concurrentRequests = 20;
      const requests = Array(concurrentRequests)
        .fill()
        .map((_, index) =>
          request(app).post('/api/v1/load-test').send({ request_id: index })
        );

      const responses = await Promise.all(requests);

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.request_id).toBe(index);
      });
    });

    it('should maintain response times under load', async () => {
      const start = Date.now();

      const requests = Array(10)
        .fill()
        .map(() => request(app).get('/api/v1/heavy-operation'));

      await Promise.all(requests);

      const duration = Date.now() - start;
      const averageResponseTime = duration / 10;

      expect(averageResponseTime).toBeLessThan(2000); // Average response time should be under 2 seconds
    });
  });

  describe('Security Integration', () => {
    it('should prevent SQL injection', async () => {
      const maliciousInput = "'; DROP TABLE users; --";

      const response = await request(app)
        .get(`/api/v1/search?q=${encodeURIComponent(maliciousInput)}`)
        .expect(200);

      // Should return normal search results, not cause database errors
      expect(response.body).toHaveProperty('results');
    });

    it('should prevent XSS attacks', async () => {
      const maliciousInput = '<script>alert("xss")</script>';

      const response = await request(app)
        .post('/api/v1/content')
        .send({ content: maliciousInput })
        .expect(201);

      // Content should be sanitized
      expect(response.body.content).not.toContain('<script>');
    });

    it('should enforce CORS policies', async () => {
      const response = await request(app)
        .options('/api/v1/info')
        .set('Origin', 'https://malicious-site.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).not.toBe(
        'https://malicious-site.com'
      );
    });
  });

  describe('Monitoring Integration', () => {
    it('should expose prometheus metrics', async () => {
      const response = await request(app).get('/metrics').expect(200);

      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_seconds');
      expect(response.text).toContain('process_cpu_seconds_total');
    });

    it('should log structured events', async () => {
      // Test that important events are logged
      const response = await request(app)
        .post('/api/v1/important-operation')
        .send({ data: 'test' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        logged: true,
      });
    });
  });
});
