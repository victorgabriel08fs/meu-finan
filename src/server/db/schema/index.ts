// Full database schema: Better Auth tables plus the domain (doc 01 §6.3).
// drizzle-kit reads this file (see drizzle.config.ts) and so does the db client.
export * from "./accounts";
export * from "./auth";
export * from "./categories";
export * from "./enums";
export * from "./planning";
export * from "./relations";
export * from "./settings";
export * from "./system";
export * from "./transactions";
export * from "./types";
