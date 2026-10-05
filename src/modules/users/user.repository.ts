import { eq } from 'drizzle-orm';
import type { ProfileInput, ProfileUpdate } from '@sparshtomar/olive-shared';
import type { DbExecutor } from '../../db/client';
import { users } from '../../db/schema';

export type UserRow = typeof users.$inferSelect;

export class UserRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(profile: ProfileInput, opts: { isDemo?: boolean } = {}): Promise<UserRow> {
    const [row] = await this.db
      .insert(users)
      .values({ ...profile, isDemo: opts.isDemo ?? false })
      .returning();
    return row!;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async update(id: string, patch: ProfileUpdate): Promise<UserRow | undefined> {
    const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }
}
