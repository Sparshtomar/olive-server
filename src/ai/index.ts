import { GoogleGenAI } from '@google/genai';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';
import { GeminiMealAnalyzer, GeminiReportExtractor } from './gemini/gemini-analyzers';
import { GeminiHealthAssistant } from './gemini/gemini-assistant';
import { GeminiStructuredClient } from './gemini/structured-client';
import { MockMealAnalyzer, MockReportExtractor } from './mock/mock-analyzers';
import { MockHealthAssistant } from './mock/mock-assistant';
import type { AiServices } from './types';

export type {
  AiServices,
  AssistantInput,
  AssistantTurn,
  BinaryInput,
  HealthAssistant,
  MealAnalyzer,
  MealInput,
  ReportExtractor,
} from './types';

/** The only place that knows which AI vendor is in use. */
export const createAiServices = (env: Env, log: FastifyBaseLogger): AiServices => {
  if (env.AI_PROVIDER === 'mock') {
    return {
      mealAnalyzer: new MockMealAnalyzer(),
      reportExtractor: new MockReportExtractor(),
      healthAssistant: new MockHealthAssistant(),
    };
  }
  // Keys from AI Studio start with "AIza" and use the Gemini Developer API; keys from
  // Vertex AI Express Mode start with "AQ." and only work against the Vertex endpoint.
  const vertexai = env.GEMINI_API_KEY?.startsWith('AQ.') ?? false;
  const client = new GeminiStructuredClient(
    new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, vertexai }),
    env.GEMINI_MODELS,
    log.child({ module: 'ai' }),
  );
  return {
    mealAnalyzer: new GeminiMealAnalyzer(client),
    reportExtractor: new GeminiReportExtractor(client),
    healthAssistant: new GeminiHealthAssistant(client),
  };
};
