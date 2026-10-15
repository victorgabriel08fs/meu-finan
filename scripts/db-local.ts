// Local embedded database (PGlite) helpers.
//   npm run db:local -- migrate   apply drizzle/ migrations (runs before `npm run dev`)
//   npm run db:local -- reset     delete the local database and migrate again
// With DATABASE_URL pointing to Neon these commands do nothing: use
// `npm run db:migrate` there.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  createPgliteClient,
  createPgliteDatabase,
  resolveDatabaseTarget,
} from "../src/server/db/client";

loadEnvConfig(process.cwd(), true);

async function main(): Promise<void> {
  const command = process.argv[2] ?? "migrate";
  if (command !== "migrate" && command !== "reset") {
    throw new Error(
      `Comando desconhecido: ${command}. Use "migrate" ou "reset".`,
    );
  }

  const target = resolveDatabaseTarget();
  if (target.kind !== "pglite") {
    console.log(
      "DATABASE_URL aponta para a Neon: banco local ignorado (use npm run db:migrate).",
    );
    return;
  }
  if (!target.dir) {
    throw new Error("O banco em memória não persiste: defina um diretório.");
  }

  const dir = resolve(target.dir);
  if (command === "reset") {
    rmSync(dir, { recursive: true, force: true });
    console.log(`Banco local apagado: ${dir}`);
  }

  const client = createPgliteClient(dir);
  try {
    await migrate(createPgliteDatabase(client) as never, {
      migrationsFolder: resolve("drizzle"),
    });
    console.log(`Banco local pronto: ${dir}`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
