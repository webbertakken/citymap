// A GitHub repository named by a person: `owner/name`, or its URL.
import { CitymapError } from "@citymap/ground-plan";

export interface Repository {
  readonly owner: string;
  readonly name: string;
}

const OWNER = /^[A-Za-z0-9-]{1,39}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** The repository a person typed: `owner/name` or `https://github.com/owner/name[/…]`, or a named rejection. */
export function parseRepository(input: string): Repository {
  const trimmed = input.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//, "");
  const [owner = "", raw = ""] = trimmed.split("/");
  const name = raw.replace(/\.git$/, "");
  if (!OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..")
    throw new CitymapError("github/bad-name", `"${input.trim()}" is not a GitHub repository: use owner/name`, {
      input,
    });
  return { owner, name };
}
