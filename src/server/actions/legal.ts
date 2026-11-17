"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { LEGAL_REQUIRED } from "@/lib/legal/version";
import { acceptLegal } from "@/server/domain/legal";
import { signedInAction } from "@/server/safe-action";

/**
 * /aceitar-termos (doc 01 §11.8): the signed-in person accepts the version
 * their screen showed, then goes to Início. The only action without the
 * terms gate (`signedInAction`), since it is how one gets past it.
 */
export const acceptLegalAction = signedInAction
  .inputSchema(
    z.object({
      accepted: z.literal(true, { error: LEGAL_REQUIRED }),
      version: z.string().max(20),
    }),
  )
  .action(async ({ parsedInput: { version }, ctx: { user } }) => {
    await acceptLegal(user.id, version);
    redirect("/inicio");
  });
