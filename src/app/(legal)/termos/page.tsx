import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocument,
  LegalSection,
  type LegalTopic,
} from "@/components/legal/legal-document";
import { PrivacyContact } from "@/components/legal/privacy-contact";
import { LEGAL_CONTROLLER } from "@/lib/legal/version";

export const metadata: Metadata = { title: "Termos de uso" };

const LINK = "text-fg underline underline-offset-2 hover:text-primary";

const TOPICS = [
  { id: "o-que-e", title: "O que é o Prumo" },
  { id: "acesso", title: "Acesso por convite" },
  { id: "uso", title: "Uso permitido" },
  { id: "seus-dados", title: "Seus dados" },
  { id: "compartilhado", title: "Compartilhado" },
  { id: "simulacoes", title: "Simulações e índices" },
  { id: "disponibilidade", title: "Disponibilidade" },
  { id: "encerramento", title: "Encerramento" },
  { id: "responsabilidade", title: "Responsabilidade" },
  { id: "mudancas", title: "Mudanças nestes termos" },
  { id: "lei", title: "Lei e foro" },
  { id: "contato", title: "Contato" },
] as const satisfies readonly LegalTopic[];

const topic = (index: number) => ({ topic: TOPICS[index], number: index + 1 });

/**
 * Terms of use (doc 01 §11.8, doc 02 §6.20): static, public, one version with
 * the privacy policy (LEGAL_VERSION). A technical draft faithful to the app,
 * not a legal opinion.
 */
export default function TermsPage() {
  return (
    <LegalDocument
      title="Termos de uso"
      topics={TOPICS}
      intro={
        <p>
          Estas são as regras para usar o Prumo. Ao criar sua senha ou ao
          continuar usando o app, você concorda com elas e com a{" "}
          <Link href="/privacidade" className={LINK}>
            Política de privacidade
          </Link>
          .
        </p>
      }
    >
      <LegalSection {...topic(0)}>
        <p>
          O Prumo é um app de controle financeiro pessoal, mantido por{" "}
          {LEGAL_CONTROLLER}. Você registra o que entra e o que sai, e o app
          organiza, soma e projeta.
        </p>
        <p>
          O Prumo não movimenta dinheiro, não se conecta ao seu banco e não é
          instituição financeira.
        </p>
      </LegalSection>

      <LegalSection {...topic(1)}>
        <p>
          Não há cadastro aberto: só entra quem recebe um convite de quem
          administra o app.
        </p>
        <ul>
          <li>Sua conta é pessoal e intransferível.</li>
          <li>Você cuida da sua senha e das suas passkeys.</li>
          <li>
            Perdeu o aparelho ou desconfia de acesso indevido? Avise quem
            administra o app, que pode encerrar suas sessões e gerar um link
            para você redefinir o acesso.
          </li>
        </ul>
        <p>O Prumo é para maiores de 18 anos.</p>
      </LegalSection>

      <LegalSection {...topic(2)}>
        <p>Use o Prumo para fins pessoais e lícitos. Não é permitido:</p>
        <ul>
          <li>tentar acessar a conta de outra pessoa;</li>
          <li>contornar limites de tentativas ou outras proteções;</li>
          <li>automatizar acessos de forma abusiva;</li>
          <li>atrapalhar o funcionamento do serviço.</li>
        </ul>
      </LegalSection>

      <LegalSection {...topic(3)}>
        <p>
          O que você digita é seu. Cada conta vê só as próprias finanças: nem
          quem administra o app vê os seus valores.
        </p>
        <p>
          Como tratamos esses dados está na{" "}
          <Link href="/privacidade" className={LINK}>
            Política de privacidade
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection {...topic(4)}>
        <p>
          O que você põe num grupo (despesas divididas, acertos e caixinhas do
          grupo) fica visível para os membros ativos desse grupo. Suas contas,
          categorias e outros lançamentos nunca aparecem para eles.
        </p>
      </LegalSection>

      <LegalSection {...topic(5)}>
        <p>
          Projeções e simulações usam taxa constante e índices publicados pelo
          Banco Central, que podem atrasar ou mudar. Simulação com taxa
          constante. Não é recomendação de investimento.
        </p>
      </LegalSection>

      <LegalSection {...topic(6)}>
        <p>
          O Prumo é gratuito e está em fase de testes. Ele é oferecido como
          está, sem garantia de disponibilidade: pode ficar fora do ar, mudar ou
          perder funções.
        </p>
        <p>
          Guarde uma cópia do que for importante: em Ajustes › Dados você baixa
          seus lançamentos em CSV. Se um dia houver planos pagos, eles virão com
          uma nova versão destes termos e um novo aceite.
        </p>
      </LegalSection>

      <LegalSection {...topic(7)}>
        <ul>
          <li>
            Você pode parar de usar o Prumo quando quiser e pedir a exclusão da
            sua conta e dos seus dados pelo contato no fim desta página.
          </li>
          <li>
            Quem administra o app pode desativar ou excluir uma conta que viole
            estes termos.
          </li>
          <li>
            Se o serviço for encerrado, você será avisado com pelo menos 30 dias
            de antecedência, para baixar seus dados.
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...topic(8)}>
        <p>
          Os números do Prumo dependem do que você digita. Na medida permitida
          pela lei, e sem afastar os seus direitos de consumidor, não
          respondemos por decisões tomadas com base nesses números ou nas
          simulações.
        </p>
      </LegalSection>

      <LegalSection {...topic(9)}>
        <p>
          A versão e a data destes termos ficam no topo da página. Quando houver
          uma mudança relevante, o app pede que você leia e aceite a nova versão
          antes de continuar.
        </p>
      </LegalSection>

      <LegalSection {...topic(10)}>
        <p>
          Estes termos seguem as leis do Brasil. Fica eleito o foro do seu
          domicílio para resolver qualquer questão sobre eles.
        </p>
      </LegalSection>

      <LegalSection {...topic(11)}>
        <p>
          Dúvidas, pedidos ou reclamações: fale com o responsável pelo Prumo{" "}
          <PrivacyContact />.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
