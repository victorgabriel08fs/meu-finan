// Zod building blocks shared by the Server Actions.
import { z } from "zod";
import {
  REMINDER_EVENTS,
  type ReminderEvent,
} from "@/lib/notifications/events";
import {
  type BillsLeadDays,
  isLeadDays,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";
import {
  isPushServiceEndpoint,
  type PushSubscriptionInput,
} from "@/lib/push/subscription";
import {
  MAX_TAGS_PER_ENTRY,
  normalizeTagName,
  TAG_NAME_MAX,
} from "@/lib/tags/name";
import { COLOR_TOKENS } from "@/server/db/schema";

export const idSchema = z.uuid({ error: "Identificador inválido." });
export const isoDate = z.iso.date({ error: "Data inválida." });
export const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido." });
/** Positive amount in cents (the sign comes from the kind of entry). */
export const amountCents = z
  .number({ error: "Informe um valor." })
  .int({ error: "Valor inválido." })
  .positive({ error: "O valor precisa ser maior que zero." })
  .max(99_999_999_999, { error: "Valor alto demais." });
export const signedCents = z
  .number({ error: "Informe um valor." })
  .int({ error: "Valor inválido." })
  .min(-99_999_999_999)
  .max(99_999_999_999);
export const description = z
  .string()
  .trim()
  .max(120, { error: "Use até 120 caracteres." });
export const colorToken = z.enum(COLOR_TOKENS);
export const iconName = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, { error: "Ícone inválido." });
/** goals.expected_rate and shared_boxes.expected_rate (decimals: 1.02 = 102% do CDI). */
export const expectedRate = z.discriminatedUnion("index", [
  z.object({ index: z.literal("fixed"), annual: z.number().min(0).max(1) }),
  z.object({ index: z.literal("cdi"), pct: z.number().min(0).max(3) }),
  z.object({ index: z.literal("selic"), pct: z.number().min(0).max(3) }),
  z.object({
    index: z.literal("ipca"),
    spread: z.number().min(-0.1).max(0.5),
  }),
]);
/** A tag name: a leading `#` and extra spaces go, 1 to 30 characters remain. */
export const tagName = z
  .string()
  .transform(normalizeTagName)
  .pipe(
    z
      .string()
      .min(1, { error: "Informe um nome." })
      .max(TAG_NAME_MAX, { error: `Use até ${TAG_NAME_MAX} caracteres.` }),
  );
/** The whole set of tags of an entry. */
export const tagIds = z.array(idSchema).max(MAX_TAGS_PER_ENTRY, {
  error: `Escolha até ${MAX_TAGS_PER_ENTRY} etiquetas.`,
});

/** Base64url (padding tolerated), the encoding of the subscription keys. */
const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/);

/**
 * `PushSubscription.toJSON()`, as the browser sends it. Here and not in
 * src/lib, so zod stays out of the browser's bundle.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isPushServiceEndpoint, {
    error: "Serviço de notificações desconhecido.",
  }),
  expirationTime: z.number().nullish(),
  keys: z.object({
    // Uncompressed P-256 public key (65 bytes) and auth secret (16 bytes).
    p256dh: base64url(80, 100),
    auth: base64url(16, 32),
  }),
}) satisfies z.ZodType<PushSubscriptionInput, PushSubscriptionInput>;

/** The whole choice of notices, as the Server Action receives it. */
export const notificationPreferencesSchema = z.strictObject({
  events: z.strictObject(
    Object.fromEntries(
      REMINDER_EVENTS.map((event) => [event, z.boolean()]),
    ) as Record<ReminderEvent, z.ZodBoolean>,
  ),
  billsLeadDays: z.custom<BillsLeadDays>(isLeadDays),
  showAmounts: z.boolean(),
}) satisfies z.ZodType<NotificationPreferences>;
