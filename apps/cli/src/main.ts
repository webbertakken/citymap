import { CitymapError } from "@citymap/ground-plan";
import { USAGE, parseCommandLine } from "./args";
import { runLay, type Io } from "./run";

/** Runs the CLI: 0 on success, 2 on a usage error, 1 on any other failure, each reported on the log. */
export async function main(argv: readonly string[], io: Io, error: (line: string) => void): Promise<number> {
  try {
    const command = parseCommandLine(argv);
    if (command.kind === "help") {
      io.log(USAGE);
      return 0;
    }
    await runLay(command, io);
    return 0;
  } catch (failure) {
    if (failure instanceof CitymapError) {
      error(`error ${failure.message}`);
      if (failure.code === "cli/usage") {
        error(USAGE);
        return 2;
      }
      return 1;
    }
    error(`error engine/unexpected: ${String(failure)}`);
    return 1;
  }
}
