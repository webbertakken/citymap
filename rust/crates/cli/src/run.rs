//! A repository's history folded into its city, and the files the command asks for.
use std::path::{Path, PathBuf};

use citymap_ground_plan::city::{City, serialise_city};
use citymap_ground_plan::fold::initial_state;
use citymap_ground_plan::land_use::{LandUse, default_land_uses};
use citymap_ground_plan::lock::{Lockfile, parse_lock, serialise_lock};
use citymap_ground_plan::region::compose::{FoldState, Options, current_city, lay, setting_key};
use citymap_ground_plan::snapshot::Snapshot;
use citymap_ground_plan::town::context::Order;
use citymap_ground_plan::{CitymapError, ErrorCode, Result};
use citymap_history::{HistoryItem, ReadOptions, Strides, is_ancestor, read_history, read_tree, resolve_commit};
use citymap_svg::{RenderOptions, render_city};

use crate::args::LayCommand;

/// The outside world the CLI touches, injected so runs are testable.
pub trait Io {
    /// A file's text, or none when there is no such file.
    fn read_file(&self, path: &Path) -> Option<String>;
    fn write_file(&mut self, path: &Path, text: &str) -> Result<()>;
    fn log(&mut self, line: &str);
    /// Milliseconds on a monotonic clock.
    fn now(&self) -> f64;
}

pub const LOCKFILE: &str = "citymap.lock.json";
/// With `--lock`, the lock is also saved every this many laid snapshots, so a long fold cut short resumes near its end.
pub const LOCK_EVERY: usize = 1000;

struct Lock {
    index: i64,
    state: FoldState,
}

/// Reads the lockfile, if any, and keeps it only when it is for these options and in the history of the target.
fn read_lock(repo: &Path, target: &str, options: &Options, io: &mut dyn Io) -> Result<Option<Lock>> {
    let Some(text) = io.read_file(&repo.join(LOCKFILE)) else {
        return Ok(None);
    };
    let Lockfile { commit, index, plat } = parse_lock(&text)?;
    if plat.setting != setting_key(options) {
        io.log(&format!("lock/ignored reason=setting lock={}", plat.setting));
        return Ok(None);
    }
    if !is_ancestor(repo, &commit, target)? {
        io.log(&format!("lock/ignored reason=not-an-ancestor commit={commit}"));
        return Ok(None);
    }
    io.log(&format!("lock/resume commit={commit} index={index}"));
    Ok(Some(Lock {
        index,
        state: initial_state(options, Some(plat), true),
    }))
}

fn save_lock(io: &mut dyn Io, repo: &Path, state: &FoldState, commit: &str, index: i64) -> Result<()> {
    let text = serialise_lock(&Lockfile {
        commit: commit.to_owned(),
        index,
        plat: state.plat.clone(),
    })?;
    io.write_file(&repo.join(LOCKFILE), &text)?;
    io.log(&format!("lock/saved commit={commit} index={index}"));
    Ok(())
}

/// Folds the repository's history into its city and writes what the command asks for. Returns the city.
pub fn run_lay(command: &LayCommand, io: &mut dyn Io, lock_every: usize, strides: Strides) -> Result<City> {
    let started = io.now();
    let repo: PathBuf = std::path::absolute(&command.repo).unwrap_or_else(|_| PathBuf::from(&command.repo));
    let mut land_uses = default_land_uses();
    if command.tests {
        land_uses.push(LandUse::Tests);
    }
    let options = Options {
        density_pct: command.density_pct,
        land_uses,
        order: Order::CentreOut,
        jog: command.jog,
        warp: command.warp,
        loops: command.loops,
        split: command.split.clone(),
        toggles: command.toggles.clone(),
    };
    let target = resolve_commit(&repo, &command.to)?;
    let lock = if command.history {
        read_lock(&repo, &target, &options, io)?
    } else {
        None
    };
    let from = lock.as_ref().map(|l| l.index);
    let mut state = lock.map_or_else(|| initial_state(&options, None, true), |l| l.state);
    let mut laid_any = false;
    let (mut laid_count, mut index) = (0usize, 0i64);
    let mut lay = |snapshot: Snapshot, io: &mut dyn Io, state: &mut FoldState| -> Result<()> {
        let events = lay(&snapshot, state, &options)?;
        laid_any = true;
        index = snapshot.index;
        laid_count += 1;
        // The lock's own commit is laid again to restore the towns as they stood; its decisions are in the plat.
        if command.verbose {
            for event in &events {
                io.log(&event.line());
            }
        }
        if command.lock && laid_count.is_multiple_of(lock_every) && snapshot.commit != target {
            save_lock(io, &repo, state, &snapshot.commit, index)?;
        }
        Ok(())
    };
    if command.history {
        let history = read_history(
            &repo,
            ReadOptions {
                to: target.clone(),
                from,
                strides,
                repository: None,
            },
        )?;
        for item in history {
            match item? {
                HistoryItem::Event(event) => io.log(&event.line()),
                HistoryItem::Snapshot(snapshot) => lay(snapshot, io, &mut state)?,
            }
        }
    } else {
        let mut events = Vec::new();
        let snapshot = read_tree(&repo, &target, None, &mut |e| events.push(e))?;
        for event in events {
            io.log(&event.line());
        }
        lay(snapshot, io, &mut state)?;
    }
    if !laid_any {
        return Err(CitymapError::new(
            ErrorCode::EngineUnexpected,
            "TypeError: no commit was laid",
        ));
    }
    let laid = current_city(&mut state, &options)?;
    let lots: i64 = laid.towns.iter().map(|t| t.stats.lots).sum();
    let overflow: i64 = laid.towns.iter().map(|t| t.stats.overflow).sum();
    if let Some(out) = &command.out {
        io.write_file(Path::new(out), &serialise_city(&laid)?)?;
    }
    if let Some(svg) = &command.svg {
        let short: String = target.chars().take(12).collect();
        let options = RenderOptions {
            title: laid.repository.clone(),
            subtitle: format!(
                "{short} · {} towns · {lots} lots · {overflow} without room",
                laid.towns.len()
            ),
            theme: command.theme,
            camera: command.camera,
            width: 1600.0,
            regions: command.voronoi,
        };
        io.write_file(Path::new(svg), &render_city(&laid, &options))?;
    }
    if command.lock {
        save_lock(io, &repo, &state, &target, index)?;
    }
    #[allow(clippy::cast_possible_truncation)]
    let ms = (io.now() - started).round() as i64;
    // The commits folded, the lock's own included; windows lay fewer of them.
    let commits = index + 1 - from.unwrap_or(0);
    io.log(&format!(
        "fold/done repository={} commits={commits} laid={laid_count} lots={lots} overflow={overflow} ms={ms}",
        laid.repository
    ));
    Ok(laid)
}
