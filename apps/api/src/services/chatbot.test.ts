import { describe, expect, it } from 'vitest';
import { fallback, parseProviderOutput } from './chatbot-logic.js';

describe('chatbot safety boundaries', () => {
  it('returns an explicit unsupported fallback without citations', () => {
    const response = fallback(
      'I could not find an approved policy source that addresses that question.',
      'no_source',
    );

    expect(response.grounded).toBe(false);
    expect(response.provider).toBe('fallback');
    expect(response.refusal).toBe('no_source');
    expect(response.citations).toHaveLength(0);
    expect(response.answer).toContain('grounded policy retrieval');
  });

  it('accepts only model citations from retrieved clauses', () => {
    const valid = parseProviderOutput(
      {
        answer: 'The approved source explains the onboarding requirement.',
        citations: [
          {
            clauseId: 'CA-ON-DOC-001',
            heading: 'Documents',
            quotedText: 'Bring the required documents.',
            sourceUri: 'https://example.test/policy',
          },
        ],
        grounded: true,
        provider: 'ollama',
        refusal: null,
      },
      new Set(['CA-ON-DOC-001']),
    );

    expect(valid?.grounded).toBe(true);
    expect(
      parseProviderOutput(
        {
          answer: 'Invented answer',
          citations: [
            {
              clauseId: 'FAKE-CLAUSE',
              heading: null,
              quotedText: 'Invented source',
              sourceUri: 'https://example.test/fake',
            },
          ],
          grounded: true,
          provider: 'ollama',
          refusal: null,
        },
        new Set(['CA-ON-DOC-001']),
      ),
    ).toBeNull();
  });

  it('rejects invalid or refused model output', () => {
    expect(parseProviderOutput({ answer: 'missing fields' }, new Set())).toBeNull();
    expect(
      parseProviderOutput(
        {
          answer: 'I cannot answer this.',
          citations: [],
          grounded: false,
          provider: 'ollama',
          refusal: 'unsupported',
        },
        new Set(),
      ),
    ).toBeNull();
  });
});
