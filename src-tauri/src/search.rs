//! In-memory full-text search over posts, profiles and shop items.
//!
//! The index is built from the decrypted cache on unlock and updated on every
//! write. It is never persisted, so no plaintext (or plaintext-derived term
//! list) ever reaches the disk, and it disappears with the workspace on lock.
//!
//! - Tokenization uses Unicode word boundaries (UAX #29), so scripts with
//!   combining marks (Sinhala, Tamil, Devanagari, ...) stay whole words.
//! - Terms are NFKC-normalized, lower-cased and stripped of Latin accents,
//!   so "cafe" finds "Café".
//! - Ranking is BM25 with per-field weights. Every query term must match
//!   (AND); terms also match as prefixes, scored lower, for search-as-you-type.
//! - `#tag` in a query matches posts carrying that hashtag.

use std::collections::{BTreeSet, HashMap};

use serde::Serialize;
use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;

const K1: f32 = 1.2;
const B: f32 = 0.75;
const PREFIX_FACTOR: f32 = 0.6;
const MAX_EXPANSIONS: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DocKind {
    Post,
    Profile,
    Item,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DocKey {
    pub kind: DocKind,
    pub id: String,
}

impl DocKey {
    pub fn new(kind: DocKind, id: &str) -> Self {
        Self { kind, id: id.to_string() }
    }
}

/// A piece of text to index with a relevance weight (e.g. names count more than bios).
pub struct Field<'a> {
    pub text: &'a str,
    pub weight: f32,
}

/// Normalizes a word for indexing and matching.
pub fn fold(word: &str) -> String {
    word.nfkd()
        .filter(|c| !('\u{0300}'..='\u{036F}').contains(c)) // combining Latin diacritics only
        .nfc()
        .collect::<String>()
        .to_lowercase()
}

pub fn tokenize(text: &str) -> Vec<String> {
    text.unicode_words().map(fold).filter(|w| !w.is_empty()).collect()
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Query {
    /// Folded words; all must match.
    pub terms: Vec<String>,
    /// Folded hashtags without `#`; all must match.
    pub tags: Vec<String>,
}

impl Query {
    pub fn parse(input: &str) -> Self {
        let mut q = Query::default();
        for token in input.split_whitespace() {
            match token.strip_prefix('#') {
                Some(tag) => q.tags.extend(tokenize(tag).into_iter().take(1)),
                None => q.terms.extend(tokenize(token)),
            }
        }
        q
    }

    pub fn is_empty(&self) -> bool {
        self.terms.is_empty() && self.tags.is_empty()
    }

    /// Everything the UI should highlight.
    pub fn highlight_terms(&self) -> Vec<String> {
        self.terms.iter().chain(&self.tags).cloned().collect()
    }
}

struct Doc {
    terms: Vec<String>,
    len: f32,
    time: i64,
}

#[derive(Default)]
pub struct SearchIndex {
    /// term -> doc -> weighted term frequency
    postings: HashMap<String, HashMap<DocKey, f32>>,
    /// Sorted vocabulary for prefix expansion.
    vocabulary: BTreeSet<String>,
    docs: HashMap<DocKey, Doc>,
    total_len: f32,
}

impl SearchIndex {
    pub fn len(&self) -> usize {
        self.docs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.docs.is_empty()
    }

    /// Adds or replaces a document. `tags` are indexed as `#tag` terms.
    pub fn upsert(&mut self, key: DocKey, fields: &[Field], tags: &[String], time: i64) {
        self.remove(&key);
        let mut tf: HashMap<String, f32> = HashMap::new();
        let mut len = 0.0;
        for field in fields {
            for term in tokenize(field.text) {
                *tf.entry(term).or_default() += field.weight;
                len += 1.0;
            }
        }
        for tag in tags {
            *tf.entry(format!("#{}", fold(tag))).or_default() += 1.0;
        }
        for (term, weight) in &tf {
            self.postings.entry(term.clone()).or_default().insert(key.clone(), *weight);
            self.vocabulary.insert(term.clone());
        }
        self.total_len += len;
        self.docs.insert(key, Doc { terms: tf.into_keys().collect(), len, time });
    }

    pub fn remove(&mut self, key: &DocKey) {
        let Some(doc) = self.docs.remove(key) else { return };
        self.total_len -= doc.len;
        for term in doc.terms {
            if let Some(posting) = self.postings.get_mut(&term) {
                posting.remove(key);
                if posting.is_empty() {
                    self.postings.remove(&term);
                    self.vocabulary.remove(&term);
                }
            }
        }
    }

    /// The exact term plus vocabulary entries it prefixes, with a weight for each.
    fn expand<'a>(&'a self, term: &'a str) -> Vec<(&'a str, f32)> {
        let mut out = Vec::new();
        if self.postings.contains_key(term) {
            out.push((term, 1.0));
        }
        if term.chars().count() >= 2 {
            let prefixes = self
                .vocabulary
                .range::<str, _>((std::ops::Bound::Excluded(term), std::ops::Bound::Unbounded))
                .take_while(|t| t.starts_with(term))
                .take(MAX_EXPANSIONS);
            out.extend(prefixes.map(|t| (t.as_str(), PREFIX_FACTOR)));
        }
        out
    }

    /// Scores for one query term: the best-matching expansion per document.
    fn term_scores(&self, term: &str) -> HashMap<&DocKey, f32> {
        let n = self.docs.len().max(1) as f32;
        let avg_len = (self.total_len / n).max(1.0);
        let mut scores: HashMap<&DocKey, f32> = HashMap::new();
        for (expanded, factor) in self.expand(term) {
            let Some(posting) = self.postings.get(expanded) else { continue };
            let df = posting.len() as f32;
            let idf = (1.0 + (n - df + 0.5) / (df + 0.5)).ln();
            for (key, tf) in posting {
                let len = self.docs.get(key).map_or(avg_len, |d| d.len);
                let score = factor * idf * (tf * (K1 + 1.0)) / (tf + K1 * (1.0 - B + B * len / avg_len));
                let best = scores.entry(key).or_default();
                *best = best.max(score);
            }
        }
        scores
    }

    /// Documents matching every term and tag, best first (newest first on ties).
    pub fn search(&self, query: &Query) -> Vec<(DocKey, f32)> {
        let terms: Vec<String> = query.terms.iter().cloned().chain(query.tags.iter().map(|t| format!("#{t}"))).collect();
        let Some((first, rest)) = terms.split_first() else { return Vec::new() };

        let mut acc: HashMap<&DocKey, f32> = self.term_scores(first);
        for term in rest {
            let scores = self.term_scores(term);
            acc.retain(|key, total| match scores.get(key) {
                Some(s) => {
                    *total += s;
                    true
                }
                None => false,
            });
            if acc.is_empty() {
                break;
            }
        }

        let mut hits: Vec<(DocKey, f32)> = acc.into_iter().map(|(k, s)| (k.clone(), s)).collect();
        hits.sort_by(|(a, sa), (b, sb)| {
            sb.partial_cmp(sa)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| self.docs[b].time.cmp(&self.docs[a].time))
        });
        hits
    }
}

/// Strips Markdown syntax for indexing and snippets. Lossy by design.
pub fn markdown_to_plain(md: &str) -> String {
    let mut out = String::with_capacity(md.len());
    let mut in_fence = false;
    for line in md.lines() {
        let mut l = line.trim_start();
        if l.starts_with("```") || l.starts_with("~~~") {
            in_fence = !in_fence;
            out.push('\n');
            continue;
        }
        if !in_fence {
            while let Some(rest) = l.strip_prefix('>') {
                l = rest.trim_start();
            }
            let hashes = l.chars().take_while(|c| *c == '#').count();
            if (1..=6).contains(&hashes) && l[hashes..].starts_with(' ') {
                l = &l[hashes + 1..];
            }
            for marker in ["- [ ] ", "- [x] ", "- [X] ", "* [ ] ", "* [x] ", "- ", "* ", "+ "] {
                if let Some(rest) = l.strip_prefix(marker) {
                    l = rest;
                    break;
                }
            }
            if let Some(dot) = l.find(". ") {
                if (1..=3).contains(&dot) && l[..dot].chars().all(|c| c.is_ascii_digit()) {
                    l = &l[dot + 2..];
                }
            }
            let is_rule = !l.is_empty() && l.chars().all(|c| matches!(c, '-' | '*' | '_' | '|' | ':' | ' '));
            if is_rule {
                out.push('\n');
                continue;
            }
        }
        out.push_str(&strip_inline(l));
        out.push('\n');
    }
    out
}

fn strip_inline(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' if i + 1 < chars.len() => {
                out.push(chars[i + 1]);
                i += 2;
                continue;
            }
            // [text](url) and ![alt](url) -> text
            '[' | '!' if c == '[' || chars.get(i + 1) == Some(&'[') => {
                let open = if c == '!' { i + 1 } else { i };
                if let Some(close) = chars[open..].iter().position(|&x| x == ']').map(|p| p + open) {
                    if chars.get(close + 1) == Some(&'(') {
                        if let Some(end) = chars[close..].iter().position(|&x| x == ')').map(|p| p + close) {
                            out.extend(&chars[open + 1..close]);
                            i = end + 1;
                            continue;
                        }
                    }
                }
                out.push(c);
            }
            '*' | '`' | '~' => {}
            '|' => out.push(' '),
            _ => out.push(c),
        }
        i += 1;
    }
    out
}

/// A short excerpt of `text` around the first word matching any term.
pub fn snippet(text: &str, terms: &[String], max_chars: usize) -> String {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let hit = text
        .unicode_word_indices()
        .find(|(_, w)| {
            let f = fold(w);
            terms.iter().any(|t| f.starts_with(t.trim_start_matches('#')))
        })
        .map_or(0, |(i, _)| i);

    let chars_before = text[..hit].chars().count();
    let mut start = chars_before.saturating_sub(max_chars / 4);
    // Begin at a word boundary.
    if start > 0 {
        let skip = text.chars().skip(start).take_while(|c| !c.is_whitespace()).count();
        if start + skip < chars_before {
            start += skip + 1;
        }
    }
    let total = text.chars().count();
    let body: String = text.chars().skip(start).take(max_chars).collect();
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.push_str(body.trim());
    if start + max_chars < total {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(id: &str) -> DocKey {
        DocKey::new(DocKind::Post, id)
    }

    fn index(docs: &[(&str, &str, &[&str])]) -> SearchIndex {
        let mut idx = SearchIndex::default();
        for (i, (id, text, tags)) in docs.iter().enumerate() {
            let tags: Vec<String> = tags.iter().map(|t| t.to_string()).collect();
            idx.upsert(key(id), &[Field { text, weight: 1.0 }], &tags, i as i64);
        }
        idx
    }

    fn ids(idx: &SearchIndex, q: &str) -> Vec<String> {
        idx.search(&Query::parse(q)).into_iter().map(|(k, _)| k.id).collect()
    }

    #[test]
    fn folds_and_tokenizes() {
        assert_eq!(tokenize("Café au LAIT, naïve!"), vec!["cafe", "au", "lait", "naive"]);
        // Sinhala words keep their vowel signs and stay single tokens.
        assert_eq!(tokenize("මම කෝපි බිව්වා").len(), 3);
        assert_eq!(fold("කෝපි"), fold("කෝපි"));
        assert_eq!(Query::parse("#Coffee with @Sarah"), Query { terms: vec!["with".into(), "sarah".into()], tags: vec!["coffee".into()] });
    }

    #[test]
    fn and_semantics_prefix_and_ranking() {
        let idx = index(&[
            ("a", "coffee with Sarah at the lake", &[]),
            ("b", "coffee coffee coffee alone", &[]),
            ("c", "kayaking on the lake", &[]),
        ]);
        assert_eq!(ids(&idx, "coffee lake"), vec!["a"]);
        assert_eq!(ids(&idx, "coffee")[0], "b", "higher term frequency ranks first");
        assert_eq!(ids(&idx, "kay"), vec!["c"], "prefix match");
        assert!(ids(&idx, "k").is_empty(), "single letters don't prefix-expand");
        assert!(ids(&idx, "coffee missing").is_empty());
        assert_eq!(ids(&idx, "CAFE").len(), 0);
        assert_eq!(ids(&idx, "Lake").len(), 2);
    }

    #[test]
    fn tags_and_updates() {
        let mut idx = index(&[("a", "morning", &["coffee"]), ("b", "evening", &["tea"])]);
        assert_eq!(ids(&idx, "#coffee"), vec!["a"]);
        assert_eq!(ids(&idx, "#cof"), vec!["a"], "tag prefix");
        assert!(ids(&idx, "coffee").is_empty(), "a tag is not a word");

        idx.upsert(key("a"), &[Field { text: "night", weight: 1.0 }], &[], 5);
        assert!(ids(&idx, "morning").is_empty(), "old terms are dropped on update");
        assert_eq!(ids(&idx, "night"), vec!["a"]);
        idx.remove(&key("a"));
        assert!(ids(&idx, "night").is_empty());
        assert_eq!(idx.len(), 1);
        assert!(!idx.vocabulary.contains("night"), "vocabulary is pruned");
    }

    #[test]
    fn strips_markdown() {
        let md = "# Title\n> quoted **bold** and _it_\n- [x] done item\n1. first\n```\ncode()\n```\n---\nSee [the site](https://x.y) ![pic](a.png) `inline` \\#notatag";
        let plain = markdown_to_plain(md);
        for expected in ["Title", "quoted bold and _it_", "done item", "first", "code()", "See the site pic inline #notatag"] {
            assert!(plain.contains(expected), "{expected:?} missing from {plain:?}");
        }
        assert!(!plain.contains("https://"));
    }

    #[test]
    fn snippets_center_on_the_match() {
        let text = "Lorem ipsum dolor sit amet. ".repeat(10) + "We went kayaking at dawn. " + &"Filler words here. ".repeat(10);
        let s = snippet(&text, &["kayak".to_string()], 80);
        assert!(s.starts_with('…') && s.ends_with('…'));
        assert!(s.contains("kayaking"));
        assert!(s.chars().count() <= 82);
        assert_eq!(snippet("short text", &["zzz".into()], 80), "short text");
    }
}
