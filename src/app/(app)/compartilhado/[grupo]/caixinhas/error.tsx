"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function CaixinhasError(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Não deu para carregar as caixinhas"
      back={{ href: "/compartilhado", label: "Voltar para Compartilhado" }}
    />
  );
}
