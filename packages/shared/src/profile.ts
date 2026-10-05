import { z } from 'zod';

export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const GOAL_TYPES = ['lose', 'maintain', 'gain'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** kg per week. 0 is only valid for "maintain". */
export const PACES = [0.25, 0.5, 0.75] as const;

export const profileFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Tell us what to call you').max(40),
  sex: z.enum(SEXES),
  age: z.number().int().min(16, 'Olive is for ages 16+').max(100),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(250),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  goalType: z.enum(GOAL_TYPES),
  paceKgPerWeek: z.number().min(0).max(1),
});

const paceMatchesGoal = (p: { goalType?: GoalType; paceKgPerWeek?: number }) => {
  if (p.goalType === undefined || p.paceKgPerWeek === undefined) return true;
  return p.goalType === 'maintain' ? p.paceKgPerWeek === 0 : p.paceKgPerWeek > 0;
};

const paceIssue = { message: 'Pick a pace for your goal', path: ['paceKgPerWeek'] };

export const profileInputSchema = profileFieldsSchema.refine(paceMatchesGoal, paceIssue);
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Partial update. Goal and pace travel together so they can't drift apart. */
export const profileUpdateSchema = profileFieldsSchema
  .partial()
  .refine((p) => (p.goalType === undefined) === (p.paceKgPerWeek === undefined), {
    message: 'Send goal and pace together',
    path: ['paceKgPerWeek'],
  })
  .refine(paceMatchesGoal, paceIssue);
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
