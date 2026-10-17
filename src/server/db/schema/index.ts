// Full database schema: Better Auth tables plus the domain (doc 01 §6.3) and
// the administration (access links, audit trail, feature flags; §11.9–11.10).
// drizzle-kit reads this file (see drizzle.config.ts) and so does the db client.
export * from "./accounts";
export * from "./admin";
export * from "./auth";
export * from "./categories";
export * from "./enums";
export * from "./flags";
export * from "./planning";
export * from "./relations";
export * from "./settings";
export * from "./system";
export * from "./tips";
export * from "./transactions";
export * from "./types";
