import { execFile } from "node:child_process";
import path from "node:path";

const DEFAULT_MAX_BUFFER = 1024 * 1024;

export type CliResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type RunCliOptions = { maxBuffer?: number };

function scriptPath() {
  return path.join(process.cwd(), "scripts", "cc.js");
}

export function runCli<T>(args: string[], stdin?: string, options?: RunCliOptions): Promise<CliResult<T>> {
  return new Promise((resolve) => {
    const maxBuffer = options?.maxBuffer ?? DEFAULT_MAX_BUFFER;
    const child = execFile("node", [scriptPath(), ...args], { maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: stderr || error.message });
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}") as T;
        resolve({ ok: true, data: parsed });
      } catch {
        resolve({ ok: false, error: stderr || "Failed to parse CLI output" });
      }
    });
    if (stdin) {
      child.stdin?.write(stdin);
    }
    child.stdin?.end();
  });
}

export async function runCliJson<T extends Record<string, unknown>>(
  args: string[],
  stdin?: string,
  options?: RunCliOptions
) {
  const result = await runCli<T>(args, stdin, options);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data as T;
}

export function runCliText(args: string[], stdin?: string, options?: RunCliOptions): Promise<CliResult<string>> {
  return new Promise((resolve) => {
    const maxBuffer = options?.maxBuffer ?? DEFAULT_MAX_BUFFER;
    const child = execFile("node", [scriptPath(), ...args], { maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: stderr || error.message });
        return;
      }
      resolve({ ok: true, data: stdout || "" });
    });
    if (stdin) {
      child.stdin?.write(stdin);
    }
    child.stdin?.end();
  });
}
