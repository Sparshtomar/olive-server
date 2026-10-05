import {
  computeTargets,
  profileInputSchema,
  type ProfileInput,
  type ProfileUpdate,
  type User,
} from '@sparshtomar/olive-shared';
import { notFound, validation } from '../../lib/errors';
import type { UserRepository, UserRow } from './user.repository';

const toUser = (row: UserRow): User => {
  const profile: ProfileInput = {
    name: row.name,
    sex: row.sex,
    age: row.age,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    activityLevel: row.activityLevel,
    goalType: row.goalType,
    paceKgPerWeek: row.paceKgPerWeek,
  };
  return {
    id: row.id,
    ...profile,
    isDemo: row.isDemo,
    targets: computeTargets(profile),
    createdAt: row.createdAt.toISOString(),
  };
};

export class UserService {
  constructor(private readonly users: UserRepository) {}

  async create(profile: ProfileInput, opts: { isDemo?: boolean } = {}): Promise<User> {
    return toUser(await this.users.create(profile, opts));
  }

  async get(id: string): Promise<User> {
    const row = await this.users.findById(id);
    if (!row) throw notFound('User');
    return toUser(row);
  }

  async update(id: string, patch: ProfileUpdate): Promise<User> {
    const current = await this.get(id);
    // Re-validate the merged profile so a partial update can't produce an invalid goal.
    const merged = profileInputSchema.safeParse({ ...current, ...patch });
    if (!merged.success) throw validation('Invalid profile', merged.error.issues);
    const row = await this.users.update(id, patch);
    if (!row) throw notFound('User');
    return toUser(row);
  }

  async delete(id: string): Promise<void> {
    await this.users.delete(id);
  }
}
