const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@/lib/observability/client")
    .then((module) => module.initClientSentry(dsn))
    .catch(() => {});
}
