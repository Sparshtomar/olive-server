import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  USER_ID_HEADER,
  type CreateMealInput,
  type FoodItem,
  type MealDraft,
  type ProfileInput,
  type ReportDraft,
} from '@sparshtomar/olive-shared';
import type { AiServices, MealInput } from '../src/ai';
import { buildApp } from '../src/app';
import { createContainer } from '../src/container';
import { createDb } from '../src/db/client';

export const PROFILE: ProfileInput = {
  name: 'Test',
  sex: 'male',
  age: 35,
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  goalType: 'lose',
  paceKgPerWeek: 0.5,
};

export const item = (overrides: Partial<FoodItem> = {}): FoodItem => ({
  name: 'Dal',
  portion: '1 katori',
  grams: 150,
  quantity: 1,
  confidence: 'high',
  nutrients: { calories: 200, protein: 10, carbs: 25, fat: 5, fiber: 5, sugar: 2, saturatedFat: 2, sodiumMg: 400 },
  ...overrides,
});

export const mealInput = (overrides: Partial<CreateMealInput> = {}): CreateMealInput => ({
  clientId: randomUUID(),
  date: '2026-10-04',
  slot: 'lunch',
  source: 'text',
  title: 'Dal',
  loggedAt: '2026-10-04T13:00:00+05:30',
  items: [item()],
  ...overrides,
});

/** Fake AI whose next answer each test controls. */
export class FakeAi implements AiServices {
  mealDraft: MealDraft = { isFood: true, title: 'Dal', items: [item()] };
  reportDraft: ReportDraft = { isLabReport: true, labName: 'Lab', reportDate: '2026-09-01', markers: [] };
  lastMealInput?: MealInput;

  mealAnalyzer = {
    analyze: async (input: MealInput) => {
      this.lastMealInput = input;
      return this.mealDraft;
    },
  };
  reportExtractor = { extract: async () => this.reportDraft };
}

export interface TestContext {
  app: FastifyInstance;
  ai: FakeAi;
  close: () => Promise<void>;
  /** Creates a user and returns headers that authenticate as them. */
  newUser: (profile?: Partial<ProfileInput>) => Promise<{ id: string; headers: Record<string, string> }>;
}

export const createTestContext = async (): Promise<TestContext> => {
  const { db, ping, close } = createDb(process.env.TEST_DATABASE_URL!);
  await db.execute(sql`truncate users cascade`);
  const ai = new FakeAi();
  const app = await buildApp({ container: createContainer(db, ai), corsOrigin: true, rateLimit: false, ping });

  return {
    app,
    ai,
    close: async () => {
      await app.close();
      await close();
    },
    newUser: async (profile = {}) => {
      const res = await app.inject({ method: 'POST', url: '/users', payload: { ...PROFILE, ...profile } });
      const { id } = res.json<{ id: string }>();
      return { id, headers: { [USER_ID_HEADER]: id } };
    },
  };
};

/** Minimal multipart body builder for inject(). */
export const multipart = (file: Buffer, filename: string, contentType: string, fields: Record<string, string> = {}) => {
  const boundary = `----olive${randomUUID()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
};

export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
