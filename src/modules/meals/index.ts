// Public API of the meals module. Other modules use the service; only the composition root sees the repository.
export type { SlotTotals } from './meal.repository';
export { mealPhotoRoutes, mealRoutes } from './meal.routes';
export { MealService } from './meal.service';
