import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACTIVITY_LEVELS,
  CHAT_ROLES,
  CONFIDENCE_LEVELS,
  GOAL_TYPES,
  MEAL_SLOTS,
  MEAL_SOURCES,
  SEXES,
} from '@sparshtomar/olive-shared';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const sexEnum = pgEnum('sex', SEXES);
export const activityLevelEnum = pgEnum('activity_level', ACTIVITY_LEVELS);
export const goalTypeEnum = pgEnum('goal_type', GOAL_TYPES);
export const mealSlotEnum = pgEnum('meal_slot', MEAL_SLOTS);
export const mealSourceEnum = pgEnum('meal_source', MEAL_SOURCES);
export const confidenceEnum = pgEnum('confidence', CONFIDENCE_LEVELS);
export const markerStatusEnum = pgEnum('marker_status', ['low', 'normal', 'high']);
export const chatRoleEnum = pgEnum('chat_role', CHAT_ROLES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sex: sexEnum('sex').notNull(),
  age: integer('age').notNull(),
  heightCm: doublePrecision('height_cm').notNull(),
  weightKg: doublePrecision('weight_kg').notNull(),
  activityLevel: activityLevelEnum('activity_level').notNull(),
  goalType: goalTypeEnum('goal_type').notNull(),
  paceKgPerWeek: doublePrecision('pace_kg_per_week').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  ...timestamps,
});

export const meals = pgTable(
  'meals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    slot: mealSlotEnum('slot').notNull(),
    source: mealSourceEnum('source').notNull(),
    title: text('title').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
    hasPhoto: boolean('has_photo').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('meals_user_date_idx').on(t.userId, t.date),
    // Idempotent create: the same device-generated id can only be saved once.
    uniqueIndex('meals_user_client_id_uq').on(t.userId, t.clientId),
  ],
);

/** Photos live apart from meals so listing meals never drags image bytes along. */
export const mealPhotos = pgTable('meal_photos', {
  mealId: uuid('meal_id')
    .primaryKey()
    .references(() => meals.id, { onDelete: 'cascade' }),
  mimeType: text('mime_type').notNull(),
  data: bytea('data').notNull(),
});

export const mealItems = pgTable(
  'meal_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    portion: text('portion').notNull(),
    grams: doublePrecision('grams').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    // Nutrients for ONE portion; totals = nutrients × quantity.
    calories: doublePrecision('calories').notNull(),
    protein: doublePrecision('protein').notNull(),
    carbs: doublePrecision('carbs').notNull(),
    fat: doublePrecision('fat').notNull(),
    fiber: doublePrecision('fiber').notNull(),
    sugar: doublePrecision('sugar').notNull(),
    saturatedFat: doublePrecision('saturated_fat').notNull(),
    sodiumMg: doublePrecision('sodium_mg').notNull(),
    confidence: confidenceEnum('confidence').notNull(),
  },
  (t) => [index('meal_items_meal_idx').on(t.mealId)],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    reportDate: date('report_date', { mode: 'string' }).notNull(),
    ...timestamps,
  },
  (t) => [index('reports_user_date_idx').on(t.userId, t.reportDate)],
);

export const reportMarkers = pgTable(
  'report_markers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // As printed on the report.
    name: text('name').notNull(),
    value: doublePrecision('value').notNull(),
    unit: text('unit').notNull(),
    refLow: doublePrecision('ref_low'),
    refHigh: doublePrecision('ref_high'),
    // Normalised against Olive's catalog (null when the marker isn't tracked).
    markerKey: text('marker_key'),
    canonicalValue: doublePrecision('canonical_value'),
    status: markerStatusEnum('status'),
  },
  (t) => [index('report_markers_report_idx').on(t.reportId), index('report_markers_key_idx').on(t.markerKey)],
);

export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ...timestamps,
  },
  (t) => [index('chat_conversations_user_updated_idx').on(t.userId, t.updatedAt)],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: chatRoleEnum('role').notNull(),
    content: text('content').notNull(),
    hasImage: boolean('has_image').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_messages_conversation_created_idx').on(t.conversationId, t.createdAt)],
);

/** Attached images live apart from messages so loading a thread never drags image bytes along. */
export const chatAttachments = pgTable('chat_attachments', {
  messageId: uuid('message_id')
    .primaryKey()
    .references(() => chatMessages.id, { onDelete: 'cascade' }),
  mimeType: text('mime_type').notNull(),
  data: bytea('data').notNull(),
});

export const mealsRelations = relations(meals, ({ many }) => ({
  items: many(mealItems),
}));

export const mealItemsRelations = relations(mealItems, ({ one }) => ({
  meal: one(meals, { fields: [mealItems.mealId], references: [meals.id] }),
}));

export const reportsRelations = relations(reports, ({ many }) => ({
  markers: many(reportMarkers),
}));

export const reportMarkersRelations = relations(reportMarkers, ({ one }) => ({
  report: one(reports, { fields: [reportMarkers.reportId], references: [reports.id] }),
}));
