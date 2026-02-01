import { Octokit } from "@octokit/rest";

export function getOctokit() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error("Missing GH_TOKEN. Run `pnpm --dir apps/command-center-ui cc init --token <ghp_...>` or create apps/command-center-ui/.env.local based on .env.example.");
  }
  return new Octokit({ auth: token });
}
