"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function GrupoError(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Não deu para carregar o grupo"
      back={{ href: "/compartilhado", label: "Voltar para Compartilhado" }}
    />
  );
}
