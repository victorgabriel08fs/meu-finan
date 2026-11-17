// LEIA-ME.txt of the data archive (Ajustes › Dados), in pt-BR (doc 02 §10).
import { ARCHIVE_FILES } from "./archive";

/** `exportedAtLabel`: "14 de novembro de 2026, 10:32", in the person's zone. */
export function dataReadme(exportedAtLabel: string): string {
  return [
    `Cópia dos seus dados no Prumo, gerada em ${exportedAtLabel}.`,
    "",
    `${ARCHIVE_FILES.json}: tudo o que está na sua conta (valores em centavos: 6450 = R$ 64,50).`,
    `${ARCHIVE_FILES.csv}: os lançamentos, para abrir no Excel.`,
    "No JSON, “access” lista as passkeys, os aparelhos com notificações e as sessões que entraram na conta (com o IP de cada uma), e “adminActivity” a atividade registrada nela. “sharing” traz os grupos do Compartilhado, com o nome das pessoas e só as despesas, acertos e caixinhas em que você participa.",
    "",
    "Senhas, passkeys e tokens de acesso não vão no arquivo.",
    "Guarde em local seguro: ele tem todas as suas finanças.",
    "",
  ].join("\r\n");
}
