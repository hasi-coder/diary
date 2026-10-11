//! Key derivation and authenticated encryption.
//!
//! Every file written to a workspace is sealed with AES-256-GCM:
//!
//! ```text
//! MDJ1 | 12-byte nonce | ciphertext + 16-byte tag
//! ```
//!
//! The associated data binds each ciphertext to its logical identity
//! (e.g. `post:<uuid>`), so files cannot be swapped or renamed undetected.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

use crate::error::{Error, Result};

pub const MAGIC: &[u8; 4] = b"MDJ1";
const NONCE_LEN: usize = 12;

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

pub fn seal(key: &Key, aad: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| Error::Crypto)?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: plaintext, aad: aad.as_bytes() })
        .map_err(|_| Error::Crypto)?;

    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypts a sealed blob. Fails with [`Error::Crypto`] if the key is wrong,
/// the data was tampered with, or the blob belongs to a different `aad`.
pub fn open(key: &Key, aad: &str, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    if sealed.len() < MAGIC.len() + NONCE_LEN || &sealed[..MAGIC.len()] != MAGIC {
        return Err(Error::Crypto);
    }
    let (nonce, ciphertext) = sealed[MAGIC.len()..].split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| Error::Crypto)?;
    cipher
        .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad: aad.as_bytes() })
        .map(Zeroizing::new)
        .map_err(|_| Error::Crypto)
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
}
