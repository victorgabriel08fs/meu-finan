"use client";

import {
  RouteError,
  type RouteErrorProps,
} from "@/components/dashboard/route-error";

export default function InicioError(props: RouteErrorProps) {
  return <RouteError {...props} title="Não deu para carregar o resumo" />;
}
