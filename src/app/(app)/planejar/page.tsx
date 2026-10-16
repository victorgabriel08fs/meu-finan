import { redirect } from "next/navigation";

/** Planejar opens on its first section. */
export default function PlanejarPage() {
  redirect("/planejar/orcamentos");
}
