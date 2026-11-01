import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  extractAndParseJSON, 
  sanitizeAnalysisOutput, 
  analyzeJournalEntry 
} from '../server/services/gemini.js';

describe('Gemini JSON Extractor & Parser Edge Cases', () => {
  it('should parse clean JSON string', () => {
    const raw = '{"sentiment":"positive","sentimentScore":0.8,"summary":"Great day","keyThemes":["happy"],"aiReflectionPrompt":"Why?"}';
    const result = extractAndParseJSON(raw);
    assert.strictEqual(result.sentiment, 'positive');
    assert.strictEqual(result.sentimentScore, 0.8);
  });

  it('should extract JSON wrapped in markdown codeblocks (```json ... ```)', () => {
    const raw = '```json\n{"sentiment":"inspired","sentimentScore":0.9,"summary":"Building AI","keyThemes":["tech"],"aiReflectionPrompt":"Next steps?"}\n```';
    const result = extractAndParseJSON(raw);
    assert.strictEqual(result.sentiment, 'inspired');
    assert.strictEqual(result.sentimentScore, 0.9);
  });

  it('should extract JSON with conversational preamble and trailing remarks', () => {
    const raw = 'Here is the analysis:\n\n{"sentiment":"stressed","sentimentScore":-0.5,"summary":"Exams week","keyThemes":["exams"],"aiReflectionPrompt":"How to relax?"}\n\nHope this helps you!';
    const result = extractAndParseJSON(raw);
    assert.strictEqual(result.sentiment, 'stressed');
    assert.strictEqual(result.sentimentScore, -0.5);
  });

  it('should throw an error if no JSON braces are found', () => {
    assert.throws(() => {
      extractAndParseJSON('I am feeling good today');
    }, /No valid JSON object boundaries found/);
  });

  it('should throw an error for null or empty string', () => {
    assert.throws(() => {
      extractAndParseJSON('');
    }, /Empty or invalid raw text input/);
  });
});

describe('Sentiment & Output Sanitization Edge Cases', () => {
  it('should clamp sentimentScore exceeding 1.0 to 1.0', () => {
    const output = sanitizeAnalysisOutput({
      sentiment: 'positive',
      sentimentScore: 5.5,
      summary: 'Extreme score test'
    });
    assert.strictEqual(output.sentimentScore, 1.0);
  });

  it('should clamp sentimentScore below -1.0 to -1.0', () => {
    const output = sanitizeAnalysisOutput({
      sentiment: 'stressed',
      sentimentScore: -99.9,
      summary: 'Negative extreme score test'
    });
    assert.strictEqual(output.sentimentScore, -1.0);
  });

  it('should normalize non-standard sentiment strings to valid categories', () => {
    const outputSad = sanitizeAnalysisOutput({ sentiment: 'very sad and tired' });
    assert.strictEqual(outputSad.sentiment, 'stressed');

    const outputAnxious = sanitizeAnalysisOutput({ sentiment: 'anxiety attack' });
    assert.strictEqual(outputAnxious.sentiment, 'anxious');

    const outputJoy = sanitizeAnalysisOutput({ sentiment: 'pure joy' });
    assert.strictEqual(outputJoy.sentiment, 'positive');
  });

  it('should fallback to reflective for completely unknown sentiments', () => {
    const output = sanitizeAnalysisOutput({ sentiment: 'unknown_alien_mood_xyz' });
    assert.strictEqual(output.sentiment, 'reflective');
  });

  it('should sanitize keyThemes to a max of 5 strings and prune non-strings', () => {
    const output = sanitizeAnalysisOutput({
      keyThemes: ['one', 'two', 123, null, 'three', 'four', 'five', 'six', 'seven']
    });
    assert.strictEqual(output.keyThemes.length, 5);
    assert.deepStrictEqual(output.keyThemes, ['one', 'two', 'three', 'four', 'five']);
  });
});

describe('analyzeJournalEntry Input Edge Cases', () => {
  it('should handle empty or whitespace-only content with graceful neutral output', async () => {
    const result = await analyzeJournalEntry('   ');
    assert.strictEqual(result.sentiment, 'neutral');
    assert.strictEqual(result.sentimentScore, 0.0);
  });

  it('should handle short / emoji-only content without crashing', async () => {
    const result = await analyzeJournalEntry('🔥');
    assert.strictEqual(result.sentiment, 'neutral');
    assert.strictEqual(result.keyThemes[0], 'brief');
  });
});
