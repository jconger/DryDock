import { execFile } from "node:child_process";
import path from "node:path";

export type CliResult<T> = { ok: true; data: T } | { ok: false; error: string };

function scriptPath() {
  return path.join(process.cwd(), "scripts", "cc.js");
}

export function runCli<T>(args: string[], stdin?: string): Promise<CliResult<T>> {
  return new Promise((resolve) => {
    const child = execFile("node", [scriptPath(), ...args], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
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

export async function runCliJson<T extends Record<string, unknown>>(args: string[], stdin?: string) {
  const result = await runCli<T>(args, stdin);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data as T;
}
