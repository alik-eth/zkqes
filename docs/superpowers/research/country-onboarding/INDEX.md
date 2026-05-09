# Country onboarding — research index

Per `specs/2026-05-09-country-identifier-privacy-guideline.md` §6, every
country onboarding goes through an explicit identifier-exposure review
that lands in one of four buckets (A/B/C/D) and produces a short written
decision (ship now / ship per-QTSP / defer / defer pending hidden-derivation
layer).

This directory hosts one checklist per candidate country. Each file is
filled in as real signed artifacts arrive — the §6.1-6.3 fields require
inspection of an actual `.p7s` / signed PDF from a natural-person QES
flow in that jurisdiction, NOT just policy-text reading.

## Status table

Working assumptions only — refresh on real-sample review (per spec §8).

| CC | Country | Working bucket | Real sample inspected? | Decision | Checklist |
|----|---------|----------------|-------------------------|----------|-----------|
| UA | Ukraine | A | yes (Diia)              | shipped V7 testnet | n/a (live) |
| AT | Austria | D (conceptual) | no                      | defer until cert review | [at.md](at.md) |
| DE | Germany | B/C (assume) | no                      | defer until real sample | [de.md](de.md) |
| FR | France  | B/C (assume) | no                      | defer until real sample | [fr.md](fr.md) |
| IT | Italy   | B/C (assume) | no                      | defer until real sample | [it.md](it.md) |
| PL | Poland  | B (assume) | no                      | defer until real sample | [pl.md](pl.md) |
| HU | Hungary | unresolved | no                      | defer until real sample | [hu.md](hu.md) |

## What "ship" means per bucket

- **A (operationally public)**: ship with limited-privacy language. The
  stable uniqueness anchor is dictionary-attackable; product copy
  reflects this. Per-country contract fork (`ZKQESRegistryDE`,
  `ZKQESRegistryFR`, …).
- **B (protected low-entropy)**: ship per-QTSP only after legal review
  confirms whether deterministic public hashing of a low-entropy
  national identifier is acceptable in that jurisdiction. May require
  product copy that explicitly admits the hash is not strongly private.
- **C (separate business identifier)**: ship the business-natural-person
  variant first; defer the personal-identifier variant pending B-bucket
  review.
- **D (sector-pseudonymous)**: ship if the cert exposes only the
  sector-derived ID. If the cert leaks the hidden base identifier (e.g.,
  AT `Stammzahl` rather than `bPK`), defer pending a hidden-derivation
  layer.

## Required artifacts for any "yes" decision

1. At least one real signed `.p7s` / signed PDF from a natural person
   (NOT a corporate / employee profile).
2. The leaf cert's DER bytes (extracted from the CMS).
3. The intermediate cert's DER (chain to a trusted root).
4. A note on whether the QTSP issues the cert from a hardware token,
   mobile app, or remote signing service (different operational
   exposure profiles).

Without all four, the country stays in "defer" until they arrive. Policy
PDFs alone are NEVER sufficient (per spec §5.2).

## How to fill in a checklist

The per-country files are templates with `**TBD**` placeholders. When a
real artifact arrives:

1. Replace the §6.1 inspected-fields table with concrete values from the
   leaf cert (use `openssl x509 -text -in leaf.der -inform DER` or the
   debug viewer at `app.zkqes.org/qtsps/<cc>/<slug>`).
2. Fill §6.2 stability classification per renewal-pair if available
   (compare two certs from the same person separated by a renewal cycle).
3. Fill §6.3 exposure based on national registry/business-lookup behavior
   (cite the specific registry URL where the identifier appears).
4. Update §6.5 product decision; mark the working-bucket row in this
   INDEX as "real-sample-confirmed".
5. If decision is "ship now", schedule a follow-up plan to add a
   `ZKQESRegistry<CC>` contract fork + cert-NFT variant + i18n strings.

## Reference checklist template

The empty template is deliberately copy-pasted into each file (rather
than DRY'd into a shared snippet) because each country's decision tree
is its own audit trail. Don't refactor into a single template that
inherits per-country values — divergence is the point.
