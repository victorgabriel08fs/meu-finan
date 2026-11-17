// Scrubber for everything that leaves the app towards Sentry (and for log
// lines): no values, descriptions, notes, e-mails, tokens, passwords, cookies,
// bodies or query strings. Pure, with its own structural types so it does not
// depend on the SDK.

export type ScrubbableBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type ScrubbableEvent = {
  message?: string;
  transaction?: string;
  logentry?: { message?: string };
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: {
        frames?: Array<{ vars?: unknown }>;
      };
    }>;
  };
  request?: {
    url?: string;
    headers?: Record<string, unknown>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    env?: unknown;
  };
  user?: unknown;
  extra?: unknown;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: Array<ScrubbableBreadcrumb | null>;
};

export const REMOVED = "[removido]";

/** Keys whose value is never kept, at any depth. */
export const SENSITIVE_KEY =
  /e-?mail|password|senha|token|secret|cookie|authorization|description|descri|notes?|observa|amount|valor|cents|balance|saldo|body/i;

const MAX_DEPTH = 8;
const ALLOWED_CONTEXTS = new Set([
  "os",
  "browser",
  "device",
  "runtime",
  "app",
  "culture",
  "cloud_resource",
  "trace",
  "nextjs",
  "job",
]);
const ALLOWED_HEADERS = new Set(["user-agent"]);
const BREADCRUMB_DATA = new Set(["method", "status_code", "url", "from", "to"]);
const DROPPED_BREADCRUMBS = new Set(["console", "ui.input"]);
const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\w-]{20,})$/i;

/** Drops query and hash; invite tokens and long ids in the path are masked. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const base = cut === -1 ? url : url.slice(0, cut);
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)?(.*)$/i.exec(base);
  const origin = match?.[1] ?? "";
  const path = match?.[2] ?? base;
  const segments = path.split("/");
  const invite = segments.indexOf("convite");
  const masked = segments.map((segment, index) => {
    if (invite !== -1 && index === invite + 1 && segment) return "[token]";
    return ID_SEGMENT.test(segment) ? ":id" : segment;
  });
  return origin + masked.join("/");
}

/** Removes what must never leave in free text (messages, SQL errors, URLs). */
export function scrubText(text: string): string {
  let out = text.replace(/params:[\s\S]*$/i, "params: [removidos]");
  out = out.replace(/https?:\/\/[^\s"'<>)]+/gi, (url) => scrubUrl(url));
  out = out.replace(
    /(^|[\s"'(])(\/[^\s"'<>)]*\?[^\s"'<>)]*)/g,
    (_, lead: string, path: string) => lead + scrubUrl(path),
  );
  out = out.replace(/[^\s@<>"'(),;]+@[^\s@<>"'(),;]+\.[a-z]{2,}/gi, "[email]");
  out = out.replace(
    /-?\s?R\$\s?-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/g,
    "[valor]",
  );
  out = out.replace(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g, "[valor]");
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [segredo]");
  out = out.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[segredo]");
  out = out.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[segredo]");
  return out;
}

function scrubDeep(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return REMOVED;
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value))
    return value.map((item) => scrubDeep(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) out[key] = REMOVED;
      else if (typeof item === "string" && /(?:path|url)$/i.test(key))
        out[key] = scrubUrl(item);
      else out[key] = scrubDeep(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(
  breadcrumb: B,
): B | null {
  if (breadcrumb.category && DROPPED_BREADCRUMBS.has(breadcrumb.category)) {
    return null;
  }
  const out: ScrubbableBreadcrumb = { ...breadcrumb };
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(out.data)) {
      if (!BREADCRUMB_DATA.has(key)) continue;
      data[key] = typeof item === "string" ? scrubUrl(item) : item;
    }
    out.data = data;
  }
  return out as B;
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out: ScrubbableEvent = { ...event };
  delete out.user;
  delete out.extra;

  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (typeof out.transaction === "string") {
    out.transaction = scrubText(scrubUrl(out.transaction));
  }
  if (out.logentry) {
    out.logentry = { ...out.logentry };
    if (typeof out.logentry.message === "string") {
      out.logentry.message = scrubText(out.logentry.message);
    }
  }
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((entry) => {
        const copy = { ...entry };
        if (typeof copy.value === "string") copy.value = scrubText(copy.value);
        if (copy.stacktrace?.frames) {
          copy.stacktrace = {
            ...copy.stacktrace,
            frames: copy.stacktrace.frames.map((frame) => {
              const { vars: _vars, ...rest } = frame;
              return rest;
            }),
          };
        }
        return copy;
      }),
    };
  }
  if (out.request) {
    const request = { ...out.request };
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    delete request.env;
    if (typeof request.url === "string") request.url = scrubUrl(request.url);
    if (request.headers) {
      const headers: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(request.headers)) {
        if (ALLOWED_HEADERS.has(key.toLowerCase())) headers[key] = item;
      }
      request.headers = headers;
    }
    out.request = request;
  }
  if (out.contexts) {
    const contexts: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(out.contexts)) {
      if (ALLOWED_CONTEXTS.has(key)) contexts[key] = scrubDeep(item, 1);
    }
    out.contexts = contexts;
  }
  if (out.tags) {
    out.tags = scrubDeep(out.tags, 1) as Record<string, unknown>;
  }
  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs
      .map((item) => (item ? scrubBreadcrumb(item) : null))
      .filter((item) => item !== null);
  }
  return out as E;
}
