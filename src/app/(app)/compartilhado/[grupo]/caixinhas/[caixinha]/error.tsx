"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function CaixinhaError(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Não deu para carregar a caixinha"
      back={{ href: "/compartilhado", label: "Voltar para Compartilhado" }}
    />
  );
}
