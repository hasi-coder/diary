//! Key derivation, authenticated encryption and length padding.
//!
//! [`seal`] produces a self-contained box used for key wrapping:
//!
//! ```text
//! MDJ1 | 12-byte nonce | ciphertext + 16-byte tag
//! ```
//!
//! Records use [`seal_raw`] behind their own header (see `record.rs`), and
//! [`pad`] their plaintext so file sizes only reveal a coarse length bucket.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

use crate::error::{Error, Result};

pub const BOX_MAGIC: &[u8; 4] = b"MDJ1";
const NONCE_LEN: usize = 12;
const LEN_PREFIX: usize = 4;

pub type Key = Zeroizing<[u8; 32]>;

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut buf = [0u8; N];
    OsRng.fill_bytes(&mut buf);
    buf
}

pub fn random_key() -> Key {
    Zeroizing::new(random_bytes::<32>())
}

/// Derives a 256-bit key-encryption key from the workspace password using Argon2id.
pub fn derive_key(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<Key> {
    let params = Params::new(memory_kib, iterations, parallelism, Some(32))
        .map_err(|e| Error::Invalid(format!("bad KDF parameters: {e}")))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0u8; 32]);
    argon
        .hash_password_into(password, salt, key.as_mut())
        .map_err(|_| Error::Crypto)?;
    Ok(key)
}

/// AES-256-GCM with a random nonce: returns `nonce | ciphertext + tag`.
pub fn seal_raw(key: &Key, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| Error::Crypto)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: plaintext, aad })
        .map_err(|_| Error::Crypto)?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Inverse of [`seal_raw`]. Fails if the key is wrong, the data was tampered
/// with, or the data was sealed under different associated data.
pub fn open_raw(key: &Key, aad: &[u8], sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    if sealed.len() < NONCE_LEN {
        return Err(Error::Crypto);
    }
    let (nonce, ciphertext) = sealed.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| Error::Crypto)?;
    cipher
        .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad })
        .map(Zeroizing::new)
        .map_err(|_| Error::Crypto)
}

pub fn seal(key: &Key, aad: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let mut out = BOX_MAGIC.to_vec();
    out.extend(seal_raw(key, aad.as_bytes(), plaintext)?);
    Ok(out)
}

pub fn open(key: &Key, aad: &str, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    match sealed.strip_prefix(BOX_MAGIC.as_slice()) {
        Some(rest) => open_raw(key, aad.as_bytes(), rest),
        None => Err(Error::Crypto),
    }
}

/// Length-prefixes `data` and zero-pads it to a multiple of `block` bytes.
pub fn pad(data: &[u8], block: usize) -> Result<Zeroizing<Vec<u8>>> {
    let len = u32::try_from(data.len()).map_err(|_| Error::Invalid("record too large".into()))?;
    let total = (LEN_PREFIX + data.len()).div_ceil(block) * block;
    let mut out = Zeroizing::new(Vec::with_capacity(total));
    out.extend_from_slice(&len.to_le_bytes());
    out.extend_from_slice(data);
    out.resize(total, 0);
    Ok(out)
}

pub fn unpad(padded: &[u8]) -> Result<&[u8]> {
    let prefix: [u8; LEN_PREFIX] = padded.get(..LEN_PREFIX).ok_or(Error::Crypto)?.try_into().map_err(|_| Error::Crypto)?;
    let len = u32::from_le_bytes(prefix) as usize;
    padded.get(LEN_PREFIX..LEN_PREFIX + len).ok_or(Error::Crypto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let key = random_key();
        let sealed = seal(&key, "post:1", b"hello").unwrap();
        assert_eq!(&open(&key, "post:1", &sealed).unwrap()[..], b"hello");
    }

    #[test]
    fn rejects_wrong_key_and_wrong_aad() {
        let key = random_key();
        let sealed = seal(&key, "post:1", b"hello").unwrap();
        assert!(open(&random_key(), "post:1", &sealed).is_err());
        assert!(open(&key, "post:2", &sealed).is_err());
    }

    #[test]
    fn rejects_tampering() {
        let key = random_key();
        let mut sealed = seal(&key, "post:1", b"hello").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert!(open(&key, "post:1", &sealed).is_err());
    }

    #[test]
    fn kdf_is_deterministic() {
        let a = derive_key(b"pw", b"saltsaltsaltsalt", 1024, 1, 1).unwrap();
        let b = derive_key(b"pw", b"saltsaltsaltsalt", 1024, 1, 1).unwrap();
        let c = derive_key(b"pw2", b"saltsaltsaltsalt", 1024, 1, 1).unwrap();
        assert_eq!(a.as_ref(), b.as_ref());
        assert_ne!(a.as_ref(), c.as_ref());
    }

    #[test]
    fn padding_hides_length() {
        let short = pad(b"hi", 1024).unwrap();
        let long = pad(&[7u8; 900], 1024).unwrap();
        assert_eq!(short.len(), 1024);
        assert_eq!(long.len(), 1024);
        assert_eq!(pad(&[7u8; 1021], 1024).unwrap().len(), 2048);
        assert_eq!(unpad(&short).unwrap(), b"hi");
        assert_eq!(unpad(&long).unwrap(), &[7u8; 900][..]);
        assert!(unpad(&[255, 255, 0, 0, 1]).is_err());
    }
}
