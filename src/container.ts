import type { AiServices } from './ai';
import type { Database } from './db/client';
import { ChatService } from './modules/chat';
import { ChatRepository } from './modules/chat/chat.repository';
import { DemoService } from './modules/demo';
import { MealService } from './modules/meals';
// The composition root is the only place allowed to reach repositories directly.
import { MealRepository } from './modules/meals/meal.repository';
import { InsightEngine, ProgressService } from './modules/progress';
import { ReportService } from './modules/reports';
import { ReportRepository } from './modules/reports/report.repository';
import { UserService } from './modules/users';
import { UserRepository } from './modules/users/user.repository';

/**
 * Composition root: the one place where concrete classes are wired together.
 * Everything else depends on constructor arguments, so tests swap in a test DB or fake AI.
 */
export const createContainer = (db: Database, ai: AiServices) => {
  const userRepo = new UserRepository(db);
  const mealRepo = new MealRepository(db);
  const reportRepo = new ReportRepository(db);
  const chatRepo = new ChatRepository(db);

  const users = new UserService(userRepo);
  const meals = new MealService(mealRepo, ai.mealAnalyzer);
  const reports = new ReportService(reportRepo, ai.reportExtractor);
  const progress = new ProgressService(meals, reports, new InsightEngine());
  const demo = new DemoService(users, meals, reports);
  const chat = new ChatService(chatRepo, progress, reports, ai.healthAssistant);

  return { users, meals, reports, progress, demo, chat };
};

export type Container = ReturnType<typeof createContainer>;
