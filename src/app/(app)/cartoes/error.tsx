"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function CartoesError(props: RouteErrorProps) {
  return (
    <RouteError
      {...props}
      title="Não deu para carregar o cartão"
      back={{ href: "/contas", label: "Ver contas" }}
    />
  );
}
