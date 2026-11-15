import { count } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { readServerEnvSafe } from "@/server/env";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Primeiro acesso" };

// Blocking route: a closed setup answers a real 404 before anything renders.
export const instant = false;

export default async function SetupPage() {
  await connection();
  // Fail closed: an unset or invalid value is a 404, never a public warning.
  const gates = [
    readServerEnvSafe("SETUP_TOKEN"),
    readServerEnvSafe("OWNER_EMAIL"),
  ];
  for (const gate of gates) {
    if (gate.status === "invalid") console.error(gate.problem);
  }
  if (gates.some((gate) => gate.status !== "ok")) notFound();
  const [row] = await db.select({ total: count() }).from(user);
  if ((row?.total ?? 0) > 0) notFound();

  return (
    <>
      <h1 className="font-bold text-[28px] text-fg leading-[34px] tracking-[-0.02em]">
        Primeiro acesso
      </h1>
      <p className="mt-2 text-[15px] text-fg-2 leading-[22px]">
        Crie o acesso de quem administra o app. Esta tela funciona uma única
        vez: depois dela, pessoas novas só entram por convite.
      </p>
      <SetupForm />
    </>
  );
}
