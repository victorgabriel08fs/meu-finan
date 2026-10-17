/**
 * Expected domain failure with a message safe to show (pt-BR). Server Actions
 * translate it into an ActionError; anything else is an unexpected error.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) =>
  new DomainError(`${what} não encontrado(a).`);

/** Refusal for anyone who is not an active administrator (Administração). */
export const NOT_ALLOWED = "Você não tem permissão para fazer isso.";
