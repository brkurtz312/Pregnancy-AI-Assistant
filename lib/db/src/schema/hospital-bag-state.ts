import { pgTable, text, timestamp, uuid, json } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const hospitalBagStateTable = pgTable("hospital_bag_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, {
      onDelete: "cascade",
    }),
  categories: json("categories").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type HospitalBagStateRow = typeof hospitalBagStateTable.$inferSelect;
