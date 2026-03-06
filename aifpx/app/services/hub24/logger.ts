/** Simple structured logger for Hub24 automation */

type LogLevel = "info" | "warn" | "error" | "debug";

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, context: string, message: string, data?: Record<string, unknown>): void {
  const entry = {
    ts: timestamp(),
    level,
    context,
    message,
    ...(data ? { data } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createLogger(context: string) {
  return {
    info: (msg: string, data?: Record<string, unknown>) => log("info", context, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", context, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", context, msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", context, msg, data),
    child: (childContext: string) => createLogger(`${context}:${childContext}`),
  };
}
