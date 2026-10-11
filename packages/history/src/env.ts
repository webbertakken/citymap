/** Variables that point git at a repository. A git hook sets them, and they would override `git -C <dir>`. */
const REPOSITORY_VARIABLES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_NAMESPACE",
];

/** The environment for running git on a named folder: without repository overrides, and never fetching blobs. */
export function gitEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, GIT_NO_LAZY_FETCH: "1" };
  for (const name of REPOSITORY_VARIABLES) delete env[name];
  return env;
}
