// A submodule whose files were not read lays as one folder holding its `.gitlink` lot; its cards say why.
import { GITLINK_FILE, type City } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import type { CardRow } from "./describe";

/** Why a submodule's files were not read, by where the city came from: a clone (the CLI, a picked folder), or GitHub. */
export const UNREAD_SUBMODULE = {
  clone: "This submodule's files are not in this clone",
  github: "This submodule's files could not be read from GitHub",
} as const;

const SUFFIX = `/${GITLINK_FILE}`;

/** Every folder holding a `.gitlink` lot: the submodules laid as one folder, their files not read. */
export function unreadFolders(city: City): ReadonlySet<string> {
  const folders = new Set<string>();
  for (const town of city.towns)
    for (const lot of town.lots) if (lot.path.endsWith(SUFFIX)) folders.add(lot.path.slice(0, -SUFFIX.length));
  return folders;
}

/** The row an unread submodule's lot, folder or town adds to its card; none for anything else. */
export function submoduleRows(hit: Hit, folders: ReadonlySet<string>, via: keyof typeof UNREAD_SUBMODULE): CardRow[] {
  const folder =
    hit.kind === "lot"
      ? hit.path.endsWith(SUFFIX)
        ? hit.path.slice(0, -SUFFIX.length)
        : null
      : hit.kind === "district"
        ? hit.path
        : hit.kind === "town"
          ? hit.root
          : null;
  return folder !== null && folders.has(folder)
    ? [{ label: "Submodule", value: "Not read", note: UNREAD_SUBMODULE[via] }]
    : [];
}
