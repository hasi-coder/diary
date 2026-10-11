//! Encrypted record files.
//!
//! Current container (schema 2+):
//!
//! ```text
//! "MDJ2" | kind (1 byte) | 12-byte nonce | AES-256-GCM( pad( envelope JSON ) )
//! ```
//!
//! The 5-byte header is the only plaintext. It identifies the record kind so
//! migration tooling can route files without guessing. The associated data is
//! `header + id`, so a file can't be renamed, swapped, or relabelled as another
//! kind without failing authentication. The plaintext is padded to 1 KiB blocks
//! so file sizes don't reveal how long an entry is.
//!
//! Inside, the envelope carries its own "front matter":
//!
//! ```json
//! { "schema": 2, "kind": "post", "meta": { ...derived... }, "data": { ...record... } }
//! ```
//!
//! Phase 1 files (`MDJ1`, bare JSON, schema 1) are still readable. They are
//! upgraded in memory and rewritten only when a migration is run.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::crypto::{self, Key};
use crate::error::{Error, Result};

pub const RECORD_MAGIC: &[u8; 4] = b"MDJ2";
/// Schema written by this build. Bump it together with a new step in `migrate.rs`.
pub const CURRENT_SCHEMA: u32 = 2;
pub const PAD_BLOCK: usize = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Kind {
    Manifest,
    Profile,
    Post,
    Item,
}

impl Kind {
    pub const RECORDS: [Kind; 3] = [Kind::Profile, Kind::Post, Kind::Item];

    fn code(self) -> u8 {
        match self {
            Kind::Manifest => 1,
            Kind::Profile => 2,
            Kind::Post => 3,
            Kind::Item => 4,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Kind::Manifest => "manifest",
            Kind::Profile => "profile",
            Kind::Post => "post",
            Kind::Item => "item",
        }
    }

    /// Directory holding this kind of record (the manifest lives at the workspace root).
    pub fn dir(self) -> &'static str {
        match self {
            Kind::Manifest => "",
            Kind::Profile => "entities",
            Kind::Post => "posts",
            Kind::Item => "items",
        }
    }

    /// Associated data used by Phase 1 (`MDJ1`) files.
    fn legacy_aad(self, id: &str) -> String {
        match self {
            Kind::Manifest => "manifest".into(),
            _ => format!("{}:{id}", self.name()),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    schema: u32,
    kind: String,
    #[serde(default)]
    meta: Value,
    data: Value,
}

pub struct Decoded {
    pub schema: u32,
    pub meta: Value,
    pub data: Value,
}

fn header(kind: Kind) -> [u8; 5] {
    let mut h = [0u8; 5];
    h[..4].copy_from_slice(RECORD_MAGIC);
    h[4] = kind.code();
    h
}

fn aad(kind: Kind, id: &str) -> Vec<u8> {
    let mut a = header(kind).to_vec();
    a.extend_from_slice(id.as_bytes());
    a
}

pub fn encode(key: &Key, kind: Kind, id: &str, data: Value, meta: Value) -> Result<Vec<u8>> {
    let envelope = Envelope { schema: CURRENT_SCHEMA, kind: kind.name().into(), meta, data };
    let json = zeroize::Zeroizing::new(serde_json::to_vec(&envelope)?);
    let padded = crypto::pad(&json, PAD_BLOCK)?;
    let mut out = header(kind).to_vec();
    out.extend(crypto::seal_raw(key, &aad(kind, id), &padded)?);
    Ok(out)
}

pub fn decode(key: &Key, kind: Kind, id: &str, bytes: &[u8]) -> Result<Decoded> {
    if bytes.starts_with(crypto::BOX_MAGIC) {
        let plaintext = crypto::open(key, &kind.legacy_aad(id), bytes)?;
        return Ok(Decoded { schema: 1, meta: Value::Null, data: serde_json::from_slice(&plaintext)? });
    }
    let h = header(kind);
    let body = bytes.strip_prefix(h.as_slice()).ok_or(Error::Crypto)?;
    let padded = crypto::open_raw(key, &aad(kind, id), body)?;
    let envelope: Envelope = serde_json::from_slice(crypto::unpad(&padded)?)?;
    if envelope.kind != kind.name() {
        return Err(Error::Crypto);
    }
    if envelope.schema > CURRENT_SCHEMA {
        return Err(Error::Invalid(format!(
            "This {} was written by a newer version of My Diary (schema {}). Update the app.",
            kind.name(),
            envelope.schema
        )));
    }
    Ok(Decoded { schema: envelope.schema, meta: envelope.meta, data: envelope.data })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trip_and_binding() {
        let key = crypto::random_key();
        let bytes = encode(&key, Kind::Post, "a", json!({"x": 1}), json!({})).unwrap();
        assert_eq!(&bytes[..4], RECORD_MAGIC);
        assert_eq!(bytes[4], 3, "kind is visible in the header");
        assert_eq!((bytes.len() - 5 - 12 - 16) % PAD_BLOCK, 0, "padded");

        let d = decode(&key, Kind::Post, "a", &bytes).unwrap();
        assert_eq!(d.schema, CURRENT_SCHEMA);
        assert_eq!(d.data, json!({"x": 1}));

        assert!(decode(&key, Kind::Post, "b", &bytes).is_err(), "bound to id");
        assert!(decode(&key, Kind::Item, "a", &bytes).is_err(), "bound to kind");
        let mut relabelled = bytes.clone();
        relabelled[4] = 4;
        assert!(decode(&key, Kind::Item, "a", &relabelled).is_err(), "header is authenticated");
    }

    #[test]
    fn reads_phase1_files() {
        let key = crypto::random_key();
        let legacy = crypto::seal(&key, "post:a", br#"{"x":1}"#).unwrap();
        let d = decode(&key, Kind::Post, "a", &legacy).unwrap();
        assert_eq!(d.schema, 1);
        assert_eq!(d.data, json!({"x": 1}));
    }
}
