import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocument,
  LegalSection,
  type LegalTopic,
} from "@/components/legal/legal-document";
import { PrivacyContact } from "@/components/legal/privacy-contact";
import { LEGAL_CONTROLLER } from "@/lib/legal/version";

export const metadata: Metadata = { title: "Política de privacidade" };

const LINK = "text-fg underline underline-offset-2 hover:text-primary";

const TOPICS = [
  { id: "controlador", title: "Quem cuida dos seus dados" },
  { id: "dados", title: "O que guardamos" },
  { id: "finalidades", title: "Para que e com que base" },
  { id: "quem-acessa", title: "Quem tem acesso" },
  { id: "transferencia", title: "Transferência internacional" },
  { id: "cookies", title: "Cookies e armazenamento no aparelho" },
  { id: "retencao", title: "Por quanto tempo" },
  { id: "direitos", title: "Seus direitos" },
  { id: "seguranca", title: "Segurança" },
  { id: "incidentes", title: "Incidentes" },
  { id: "idade", title: "Idade" },
  { id: "mudancas", title: "Mudanças nesta política" },
] as const satisfies readonly LegalTopic[];

const topic = (index: number) => ({ topic: TOPICS[index], number: index + 1 });

/**
 * Privacy policy under the LGPD (Lei 13.709/2018; doc 01 §11.8, doc 02
 * §6.20): static, public, one version with the terms (LEGAL_VERSION). Keep it
 * faithful to what the app stores; a technical draft, not a legal opinion.
 */
export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Política de privacidade"
      topics={TOPICS}
      intro={
        <p>
          Como o Prumo trata os seus dados pessoais, conforme a Lei Geral de
          Proteção de Dados (Lei nº 13.709/2018). Ela vale junto com os{" "}
          <Link href="/termos" className={LINK}>
            Termos de uso
          </Link>
          .
        </p>
      }
    >
      <LegalSection {...topic(0)}>
        <p>
          O controlador dos seus dados é {LEGAL_CONTROLLER}, pessoa natural
          responsável pelo Prumo. Contato: <PrivacyContact />.
        </p>
        <p>
          Como agente de tratamento de pequeno porte (Resolução CD/ANPD nº
          2/2022), o Prumo não tem encarregado nomeado: o contato acima é o
          canal de atendimento a você.
        </p>
      </LegalSection>

      <LegalSection {...topic(1)}>
        <ul>
          <li>
            <strong>Acesso:</strong> nome, e-mail, senha (só uma versão
            embaralhada, que não pode ser revertida), passkeys (só a chave
            pública), papel na conta e a data em que você aceitou estes
            documentos.
          </li>
          <li>
            <strong>Finanças que você digita ou importa:</strong> contas,
            cartões, lançamentos, categorias, etiquetas, orçamentos, metas,
            caixinhas, simulações, notas, regras de categoria aprendidas e dados
            de importação de extratos.
          </li>
          <li>
            <strong>Compartilhado:</strong> o que você põe num grupo e o e-mail
            de quem você convida para ele.
          </li>
          <li>
            <strong>Técnicos:</strong> sessões (endereço IP, aparelho e
            navegador, último acesso), inscrições de notificação do aparelho,
            preferências (tema, avisos, dicas vistas), contagem temporária de
            tentativas de login por endereço e o registro de atividade da
            administração (nome e e-mail, nunca valores).
          </li>
        </ul>
        <p>
          <strong>
            Não pedimos CPF, senhas de banco nem números completos de cartão.
          </strong>
        </p>
      </LegalSection>

      <LegalSection {...topic(2)}>
        <ul>
          <li>
            <strong>Prestar o serviço que você pediu</strong> (guardar, somar e
            projetar suas finanças): execução de contrato (art. 7º, V).
          </li>
          <li>
            <strong>Segurança</strong> (sessões, limite de tentativas, registro
            de atividade): legítimo interesse (art. 7º, IX).
          </li>
          <li>
            <strong>Notificações no celular:</strong> consentimento (art. 7º,
            I), que você revoga em Ajustes › Notificações ou no próprio
            aparelho.
          </li>
        </ul>
        <p>
          Sem publicidade, sem venda de dados, sem perfil para terceiros e sem
          decisão automatizada que afete você.
        </p>
      </LegalSection>

      <LegalSection {...topic(3)}>
        <ul>
          <li>
            <strong>Você.</strong>
          </li>
          <li>
            <strong>Quem administra o app</strong> vê só nome, e-mail, papel,
            situação da conta e último acesso. Nunca os seus valores.
          </li>
          <li>
            <strong>Membros de um grupo</strong> veem o que você pôs no grupo.
          </li>
          <li>
            <strong>Operadores</strong> (art. 5º, VII): Vercel (hospedagem, com
            servidores em São Paulo) e Neon (banco de dados). Os serviços de
            notificação dos navegadores (Apple, Google, Mozilla) recebem o aviso
            cifrado quando você liga as notificações. As medições de desempenho
            e de visitas da Vercel não usam cookies nem identificam você.
          </li>
          <li>
            <strong>Autoridades</strong>, só por obrigação legal ou ordem
            judicial.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...topic(4)}>
        <p>
          Vercel e Neon são empresas dos Estados Unidos, e os dados podem ser
          tratados fora do Brasil, com as garantias contratuais previstas no
          art. 33 da LGPD.
        </p>
      </LegalSection>

      <LegalSection {...topic(5)}>
        <p>
          Só o necessário: o cookie de sessão, para você continuar conectado, e
          preferências guardadas no aparelho (como o tema e o modo discreto).
          Sem cookies de rastreamento.
        </p>
      </LegalSection>

      <LegalSection {...topic(6)}>
        <ul>
          <li>Enquanto a sua conta existir.</li>
          <li>Lançamentos excluídos: apagados de vez em 30 dias.</li>
          <li>Avisos lidos: 90 dias.</li>
          <li>Sessões: até 30 dias sem uso.</li>
          <li>
            Excluída a conta, tudo dela é apagado na hora. Os grupos guardam o
            seu nome no histórico, e o registro de atividade da administração
            mantém nome e e-mail.
          </li>
          <li>
            Cópias de segurança do banco somem quando saem da janela de retenção
            do provedor.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...topic(7)}>
        <p>Pela LGPD (art. 18), você pode pedir:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            anonimização, bloqueio ou eliminação do que for desnecessário ou
            excessivo;
          </li>
          <li>portabilidade dos seus dados;</li>
          <li>eliminação dos seus dados;</li>
          <li>informação sobre com quem compartilhamos;</li>
          <li>revogação do consentimento.</li>
        </ul>
        <p>
          Para pedir, fale conosco <PrivacyContact />. Respondemos em até 15
          dias. No app, você já corrige seus dados e baixa seus lançamentos em
          CSV (Ajustes › Dados). Você também pode reclamar à Autoridade Nacional
          de Proteção de Dados (ANPD), em gov.br/anpd.
        </p>
      </LegalSection>

      <LegalSection {...topic(8)}>
        <p>
          Conexão cifrada (TLS), banco cifrado em repouso, senhas guardadas só
          de forma embaralhada, passkeys, sessões que você encerra quando
          quiser, isolamento entre contas e administração sem acesso a valores.
        </p>
      </LegalSection>

      <LegalSection {...topic(9)}>
        <p>
          Se houver um incidente de segurança com risco relevante para você,
          avisamos você e a ANPD (art. 48) no prazo da regulamentação.
        </p>
      </LegalSection>

      <LegalSection {...topic(10)}>
        <p>O Prumo é para maiores de 18 anos.</p>
      </LegalSection>

      <LegalSection {...topic(11)}>
        <p>
          A versão e a data desta política ficam no topo da página. Quando
          houver uma mudança relevante, o app pede que você leia e aceite a nova
          versão antes de continuar.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
