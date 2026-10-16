import { redirect } from "next/navigation";

/** There is no landing page: the app opens on Início (doc 02 §4.1). */
export default function Home() {
  redirect("/inicio");
}
