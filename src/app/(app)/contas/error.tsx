"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function ContasError(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Não deu para carregar as contas"
      back={{ href: "/inicio", label: "Voltar para o Início" }}
    />
  );
}
