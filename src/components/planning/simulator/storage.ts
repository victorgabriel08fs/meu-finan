/**
 * The simulator's last inputs, per account on this device (doc 02 §6.11);
 * never shared, never required. The key carries the user id: a device can be
 * shared. "Excluir minha conta" removes it too.
 */
export const simulatorStorageKey = (userId: string) =>
  `meu-finan:simulador:v1:${userId}`;
