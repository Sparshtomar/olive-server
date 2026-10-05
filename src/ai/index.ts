import { GoogleGenAI } from '@google/genai';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';
import { GeminiMealAnalyzer, GeminiReportExtractor } from './gemini/gemini-analyzers';
import { GeminiStructuredClient } from './gemini/structured-client';
import { MockMealAnalyzer, MockReportExtractor } from './mock/mock-analyzers';
import type { AiServices } from './types';

export type { AiServices, BinaryInput, MealAnalyzer, MealInput, ReportExtractor } from './types';

/** The only place that knows which AI vendor is in use. */
export const createAiServices = (env: Env, log: FastifyBaseLogger): AiServices => {
  if (env.AI_PROVIDER === 'mock') {
    return { mealAnalyzer: new MockMealAnalyzer(), reportExtractor: new MockReportExtractor() };
  }
  const client = new GeminiStructuredClient(
    new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }),
    env.GEMINI_MODELS,
    log.child({ module: 'ai' }),
  );
  return { mealAnalyzer: new GeminiMealAnalyzer(client), reportExtractor: new GeminiReportExtractor(client) };
};
