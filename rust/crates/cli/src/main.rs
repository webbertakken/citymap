//! `citymap`: a repository in, a city (JSON, SVG) and a lockfile out. The Rust implementation of `apps/cli`.
/// With the `mimalloc` feature, mimalloc allocates: the fold allocates and frees many small values each commit.
#[cfg(feature = "mimalloc")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod args;
mod run;

use std::io::Write as _;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use citymap_ground_plan::{CitymapError, ErrorCode, Result};
use citymap_history::FOLD_STRIDES;

use crate::args::{Command, USAGE, parse_command_line};
use crate::run::{Io, LOCK_EVERY, run_lay};

/// The real world: files, the clock, standard output.
struct System {
    started: Instant,
    out: std::io::BufWriter<std::io::Stdout>,
}

impl Io for System {
    fn read_file(&self, path: &Path) -> Option<String> {
        path.exists().then(|| std::fs::read_to_string(path).ok()).flatten()
    }

    fn write_file(&mut self, path: &Path, text: &str) -> Result<()> {
        std::fs::write(path, text).map_err(|e| {
            CitymapError::new(
                ErrorCode::EngineUnexpected,
                format!("Error: {e}, open '{}'", path.display()),
            )
        })
    }

    fn log(&mut self, line: &str) {
        let _ = writeln!(self.out, "{line}");
        let _ = self.out.flush();
    }

    fn now(&self) -> f64 {
        self.started.elapsed().as_secs_f64() * 1000.0
    }
}

/// Runs the CLI: 0 on success, 2 on a usage error, 1 on any other failure, each reported on standard error.
fn main_with(argv: &[String], io: &mut dyn Io, error: &mut dyn FnMut(&str)) -> u8 {
    let failure = match parse_command_line(argv) {
        Ok(Command::Help) => {
            io.log(USAGE);
            return 0;
        }
        Ok(Command::Lay(command)) => match run_lay(&command, io, LOCK_EVERY, FOLD_STRIDES) {
            Ok(_) => return 0,
            Err(failure) => failure,
        },
        Err(failure) => failure,
    };
    error(&format!("error {failure}"));
    if failure.code == ErrorCode::CliUsage {
        error(USAGE);
        return 2;
    }
    1
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut io = System {
        started: Instant::now(),
        out: std::io::BufWriter::new(std::io::stdout()),
    };
    let code = main_with(&argv, &mut io, &mut |line| eprintln!("{line}"));
    ExitCode::from(code)
}

#[cfg(test)]
mod tests;
