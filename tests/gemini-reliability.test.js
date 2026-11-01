import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  analyzeJournalEntry, 
  chatWithCompanion, 
  withTimeout 
} from '../server/services/gemini.js';

test('Gemini Reliability — Timeout Handling (DEADLINE_EXCEEDED)', async (t) => {
  await t.test('withTimeout helper should reject if operation exceeds timeout limit', async () => {
    const hangingPromise = new Promise((resolve) => setTimeout(resolve, 200));
    
    await assert.rejects(
      async () => {
        await withTimeout(hangingPromise, 25, 'Hanging call test');
      },
      (err) => {
        assert.equal(err.code, 'DEADLINE_EXCEEDED');
        assert.match(err.message, /Hanging call test/);
        return true;
      }
    );
  });

  await t.test('analyzeJournalEntry should gracefully return fallback when upstream call times out', async () => {
    const hangingMockClient = {
      models: {
        generateContent: () => new Promise((resolve) => setTimeout(resolve, 500))
      }
    };

    const startTime = Date.now();
    // Use short 30ms timeout for deterministic quick test
    const result = await analyzeJournalEntry(
      'Today I was thinking about building reliable AI applications.',
      'Bangalore, India',
      hangingMockClient,
      30
    );
    const duration = Date.now() - startTime;

    assert.ok(duration < 250, `Expected quick timeout fallback, took ${duration}ms`);
    assert.equal(result.sentiment, 'reflective');
    assert.ok(result.summary.length > 0);
    assert.ok(Array.isArray(result.keyThemes));
    assert.ok(result.aiReflectionPrompt.length > 0);
  });

  await t.test('chatWithCompanion should return reassuring fallback when chat call times out', async () => {
    const hangingChatClient = {
      chats: {
        create: () => ({
          sendMessage: () => new Promise((resolve) => setTimeout(resolve, 500))
        })
      }
    };

    const reply = await chatWithCompanion(
      [],
      'Can you help me process some stress?',
      hangingChatClient,
      30
    );

    assert.match(reply, /I hear you\. What small step could bring you a sense of calm/i);
  });
});

test('Gemini Reliability — Rate Limiting & Quota Exhaustion (429 / RESOURCE_EXHAUSTED)', async (t) => {
  await t.test('should gracefully handle 429 RESOURCE_EXHAUSTED error during journal analysis', async () => {
    const rateLimitedClient = {
      models: {
        generateContent: async () => {
          const err = new Error('RESOURCE_EXHAUSTED: Quota exceeded for quota metric GenerateContentRequestsPerMinute');
          err.status = 429;
          throw err;
        }
      }
    };

    const journalText = 'Reflecting on project milestones and deadline pressures.';
    const result = await analyzeJournalEntry(
      journalText,
      'Campus Lab',
      rateLimitedClient
    );

    assert.equal(result.sentiment, 'reflective');
    assert.ok(result.summary.includes('Reflecting on project milestones'));
    assert.deepEqual(result.keyThemes, ['reflection']);
  });

  await t.test('should gracefully handle 429 rate limit during companion chat', async () => {
    const rateLimitedChatClient = {
      chats: {
        create: () => ({
          sendMessage: async () => {
            const err = new Error('Rate limit exceeded: 429');
            err.status = 429;
            throw err;
          }
        })
      }
    };

    const reply = await chatWithCompanion(
      [],
      'Hello, are you there?',
      rateLimitedChatClient
    );

    assert.ok(reply.length > 0);
    assert.match(reply, /I hear you|sense of calm/i);
  });
});

test('Gemini Reliability — Upstream Service Outages (500, 503 UNAVAILABLE)', async (t) => {
  await t.test('should handle 503 Service Unavailable without crashing or throwing', async () => {
    const unavailableClient = {
      models: {
        generateContent: async () => {
          const err = new Error('503 Service Unavailable: The model is overloaded. Please try again later.');
          err.status = 503;
          throw err;
        }
      }
    };

    const result = await analyzeJournalEntry(
      'Spent time reviewing system architecture and container specs.',
      '',
      unavailableClient
    );

    assert.equal(result.sentiment, 'reflective');
    assert.ok(result.summary.length > 0);
    assert.ok(result.aiReflectionPrompt.length > 0);
  });
});

test('Gemini Reliability — Safety Filter Blocks & Malformed Payload Handling', async (t) => {
  await t.test('should handle safety-blocked or empty text response gracefully', async () => {
    const safetyBlockedClient = {
      models: {
        generateContent: async () => ({
          text: null,
          candidates: [{ finishReason: 'SAFETY' }]
        })
      }
    };

    const result = await analyzeJournalEntry(
      'A deeply intense entry exploring heavy emotions.',
      '',
      safetyBlockedClient
    );

    assert.equal(result.sentiment, 'reflective');
    assert.ok(result.summary.length > 0);
  });

  await t.test('should handle model output with unparseable/corrupted JSON', async () => {
    const malformedJsonClient = {
      models: {
        generateContent: async () => ({
          text: 'I could not generate valid json because: Internal parser error: {{{[[[['
        })
      }
    };

    const result = await analyzeJournalEntry(
      'Writing about personal experiences today.',
      '',
      malformedJsonClient
    );

    assert.equal(result.sentiment, 'reflective');
    assert.ok(result.summary.includes('Writing about personal'));
  });
});
