import { pgTable, text, timestamp, uuid, json } from "drizzle-orm/pg-core";

export const birthPlanAnswersTable = pgTable("birth_plan_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  answers: json("answers").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BirthPlanAnswersRow = typeof birthPlanAnswersTable.$inferSelect;
