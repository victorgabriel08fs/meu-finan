import "server-only";
import { readServerEnvSafe } from "@/server/env";

const LINK = "text-fg underline underline-offset-2 hover:text-primary";

/**
 * The data subject's channel (LGPD, art. 18 and 41), as the end of a sentence:
 * "pelo e-mail contato@…" from PRIVACY_CONTACT_EMAIL or, without it, through
 * whoever administers the app (who sent the invite). Rendered while
 * prerendering /termos and /privacidade, so it shows the value of the build:
 * a change takes a new deploy, like every variable here.
 */
export function PrivacyContact() {
  const email = readServerEnvSafe("PRIVACY_CONTACT_EMAIL");
  if (email.status === "ok") {
    return (
      <>
        pelo e-mail{" "}
        <a href={`mailto:${email.value}`} className={`${LINK} break-all`}>
          {email.value}
        </a>
      </>
    );
  }
  if (email.status === "invalid")
    console.warn(`[privacidade] ${email.problem}`);
  return (
    <>por meio de quem administra o Prumo (a pessoa que enviou o seu convite)</>
  );
}
