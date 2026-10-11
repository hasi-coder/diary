//! Versioned, iterative storage migrations.
//!
//! Each [`Step`] upgrades a record's data from `to - 1` to `to`. On unlock,
//! records below [`CURRENT_SCHEMA`] are upgraded in memory so the app works
//! right away. Nothing on disk changes until the user runs the migration
//! from Settings, which rewrites the stale files so the change lands as a
//! deliberate, reviewable git diff.
//!
//! Derived front matter (`meta` in the envelope) is always recomputed when a
//! record is written, so a step that only adds pre-built metadata needs no
//! data transform. It just bumps the schema so old files get rewritten.
//!
//! To add a migration: bump `record::CURRENT_SCHEMA`, append a `Step` here,
//! and add a test with a fixture in the previous format.

use serde::Serialize;
use serde_json::Value;

use crate::error::Result;
use crate::record::{Kind, CURRENT_SCHEMA};

pub struct Step {
    pub to: u32,
    pub title: &'static str,
    pub detail: &'static str,
    pub apply: fn(Kind, Value) -> Result<Value>,
}

fn unchanged(_: Kind, data: Value) -> Result<Value> {
    Ok(data)
}

pub const STEPS: &[Step] = &[Step {
    to: 2,
    title: "Hardened storage format",
    detail: "Re-encrypts every record in a self-describing container, pads files to 1 KiB blocks so sizes \
             don't reveal entry length, adds encrypted front matter (mentions and #tags) to posts, and \
             removes the plaintext workspace name from workspace.json.",
    apply: unchanged,
}];

/// Upgrades record data from `schema` to the current schema.
pub fn upgrade(kind: Kind, schema: u32, mut data: Value) -> Result<Value> {
    for step in STEPS.iter().filter(|s| s.to > schema && s.to <= CURRENT_SCHEMA) {
        data = (step.apply)(kind, data)?;
    }
    Ok(data)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepInfo {
    pub version: u32,
    pub title: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationStatus {
    /// Schema written by this build.
    pub current_schema: u32,
    /// Oldest schema found on disk.
    pub disk_schema: u32,
    /// Files that will be rewritten by the migration.
    pub stale_files: usize,
    /// Steps between `disk_schema` and `current_schema`.
    pub pending: Vec<StepInfo>,
}

pub fn status(disk_schema: u32, stale_files: usize) -> MigrationStatus {
    MigrationStatus {
        current_schema: CURRENT_SCHEMA,
        disk_schema,
        stale_files,
        pending: STEPS
            .iter()
            .filter(|s| s.to > disk_schema)
            .map(|s| StepInfo { version: s.to, title: s.title.into(), detail: s.detail.split_whitespace().collect::<Vec<_>>().join(" ") })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_are_contiguous_and_reach_current() {
        for (i, step) in STEPS.iter().enumerate() {
            assert_eq!(step.to, i as u32 + 2, "steps must go 2, 3, 4, ... in order");
        }
        assert_eq!(STEPS.last().map(|s| s.to).unwrap_or(1), CURRENT_SCHEMA);
    }

    #[test]
    fn status_lists_pending_steps() {
        assert_eq!(status(1, 5).pending.len(), STEPS.len());
        assert!(status(CURRENT_SCHEMA, 0).pending.is_empty());
    }
}
