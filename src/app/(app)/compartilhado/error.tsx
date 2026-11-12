"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function CompartilhadoError(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Não deu para carregar o Compartilhado"
      back={{ href: "/inicio", label: "Voltar para o Início" }}
    />
  );
}
