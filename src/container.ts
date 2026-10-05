import type { AiServices } from './ai';
import type { Database } from './db/client';
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

  const users = new UserService(userRepo);
  const meals = new MealService(mealRepo, ai.mealAnalyzer);
  const reports = new ReportService(reportRepo, ai.reportExtractor);
  const progress = new ProgressService(meals, reports, new InsightEngine());
  const demo = new DemoService(users, meals, reports);

  return { users, meals, reports, progress, demo };
};

export type Container = ReturnType<typeof createContainer>;
