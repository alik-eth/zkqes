# ZKQES — Country Identifier Privacy Guideline

> Date: 2026-05-09. Status: authoritative guideline for country onboarding.
>
> Builds on:
> - [`2026-04-24-per-country-registries-design.md`](2026-04-24-per-country-registries-design.md)
> - [`2026-05-05-zkqes-v5_4-per-country-age-design.md`](2026-05-05-zkqes-v5_4-per-country-age-design.md)
> - [`2026-04-18-person-nullifier-amendment.md`](2026-04-18-person-nullifier-amendment.md)
> - [`2026-05-07-v5_5-multi-algorithm-signature-extension.md`](2026-05-07-v5_5-multi-algorithm-signature-extension.md)

## 1. Purpose

This document records a product and protocol pivot:

- we do **not** treat "European QES identity" as one uniform privacy domain;
- we do **not** treat "tax ID" as universally public;
- we do **not** treat a public deterministic hash of a low-entropy state identifier as strong privacy.

Instead, ZKQES expands **country by country**, and where necessary **QTSP
profile by QTSP profile**, with an explicit review of:

- what identity fields the real certificate exposes,
- whether those fields are stable across renewals,
- whether those fields are publicly discoverable in practice,
- and what privacy claim is honest for that jurisdiction.

The output of that review is a country-specific integration decision, not a
global assumption.

## 2. Why We Are Pivoting

Earlier architecture work already established that registries must be
per-country because national identifier namespaces do not collapse to one
pan-EU human identifier.

The additional clarification now is about **privacy of the stable dedup key**.

### 2.1 Public deterministic uniqueness is not strong privacy

If the protocol derives a stable public anchor from:

- a tax ID,
- a national person number,
- a social-security number,
- or `identifier || dob`,

then that anchor is only as private as the underlying identifier space.

For many real civil identifiers:

- the space is small,
- the format is public,
- parts of the identifier may encode birthdate / sex / birthplace,
- or the identifier is operationally exposed in business or registry contexts.

Therefore:

- a public deterministic hash of such data is **dictionary-attackable**;
- a public deterministic hash of such data is **not** a strong pseudonym;
- and saying "the tax ID stays private because we hash it" is not honest.

### 2.2 The opposite blanket assumption is also wrong

It is also wrong to say "tax IDs are public anyway" as a protocol-wide rule.

Some jurisdictions:

- operationally expose business identifiers but not personal tax identifiers,
- use separate business and personal identifier layers,
- or use sector-specific pseudonyms or equivalent legal/technical controls.

So the right conclusion is not "all tax IDs are public." The right conclusion
is:

> identifier exposure and enumerability are jurisdiction-specific and sometimes
> profile-specific.

### 2.3 Current ZKQES is self-contained certified uniqueness, not hidden stable identity

Current V5.x architecture gives us:

- certified state-backed identity input from the QES/certificate,
- deterministic uniqueness inside a country/profile scope,
- selective disclosure for usage-time proofs,
- context-bound nullifiers,
- but **not** a universally hidden stable dedup anchor.

That is acceptable, but it must be described correctly.

## 3. Terminology

Use these terms in future specs and product copy.

### 3.1 Allowed

- **country-scoped uniqueness**
- **certified uniqueness**
- **deterministic uniqueness from certified identity data**
- **dictionary-attackable public uniqueness anchor**
- **limited privacy for the stable dedup key**
- **self-contained certified uniqueness**

### 3.2 Avoid

- **enumerated tax ID**
- **tax ID is public**
- **private tax-ID hash**
- **anonymous stable identifier**
- **pseudonym** for the current design, unless a hidden derivation layer really exists

The main issue is not "we publish raw tax IDs." The issue is:

> a public deterministic function of low-entropy identity data may still be
> reversible or enumerable by dictionary attack.

## 4. Country Classification Model

Every country integration MUST be classified into one of these buckets.

### Bucket A — Operationally public or readily enumerable identifier

The stable identity field used in the cert is, in practice:

- publicly exposed in common workflows, or
- easily enumerable from a small known space, or
- openly used as a public-facing business/person identifier.

In this bucket, the stable uniqueness anchor should be treated as
**publicly guessable enough that hashing does not buy strong secrecy**.

Example posture:

- Ukraine often lands here for FOP/business-adjacent flows.

### Bucket B — Protected personal identifier, but still low-entropy

The personal identifier is legally protected and not routinely public, but:

- it is still low-entropy,
- still structurally meaningful,
- and still unsafe to call "private" if the protocol publishes a deterministic
  hash of it.

In this bucket, the stable uniqueness anchor is **not operationally public**,
but still **not cryptographically private** if exposed deterministically.

Examples that often land near this bucket:

- Germany personal `IdNr`
- France personal `numéro fiscal` / `NIR`
- Poland `PESEL`
- Italy `codice fiscale`

### Bucket C — Separate public business identifier

The country distinguishes:

- a personal/national identifier, and
- a separate public business identifier used in commerce or public lookup.

This bucket matters because a natural-person business certificate may expose:

- the public business identifier,
- a provider-local serial,
- or the personal identifier,

and those are very different privacy outcomes.

Examples:

- Germany `IdNr` vs `W-IdNr`
- Italy `codice fiscale` vs `partita IVA`
- Belgium national register number vs enterprise number

### Bucket D — Sector-specific pseudonym / hidden derivation

The country or eID system uses:

- a hidden base identifier, and
- a sector-specific derived identifier or equivalent pseudonym mechanism.

Only in this bucket do we start talking about real pseudonymization of the
stable dedup anchor.

Example:

- Austria `Stammzahl` -> `bPK`

## 5. Integration Policy

### 5.1 No blanket EU onboarding

We do not onboard "EU QES" as one privacy policy. We onboard:

- one country at a time,
- one registry at a time,
- one trust list at a time,
- and where needed one QTSP/profile at a time.

### 5.2 No country without a real sample

A country is not considered reviewed until we have inspected at least one real
signature artifact from that country:

- signed PDF,
- detached CMS/CAdES `.p7s`,
- or another real end-user signed object.

Policy PDFs alone are useful but insufficient.

### 5.3 Corporate and personal signatures must be separated

A sample signed by:

- a company representative,
- a QTSP employee,
- or a document signed under a corporate profile

does **not** answer the same question as a plain natural-person qualified
signature.

The review MUST distinguish:

- natural-person QES,
- sole-proprietor / business-natural-person QES,
- employee / corporate delegated signing,
- provider internal signatures.

### 5.4 Onboarding output is a written decision

Every country onboarding must produce a short written note that answers:

1. What exact stable fields are present in the real cert?
2. Are they person-stable, cert-stable, or business-stable?
3. Are they public, practically discoverable, or only low-entropy?
4. What privacy claim is honest for this country?
5. Should the country be supported now, deferred, or routed through a future
   hidden-derivation design?

## 6. Required Research Checklist Per Country

For every candidate country/QTSP, collect the following before shipping.

### 6.1 Certificate field inspection

Inspect real signed artifacts and record:

- `subject.serialNumber`
- `dateOfBirth` or national DOB extension, if any
- `organizationIdentifier`
- `givenName`, `surname`, `commonName`
- provider-local certificate serial
- public key/SPKI stability across samples, if available

### 6.2 Stability classification

Classify each field as:

- **person-stable** — likely survives cert renewal
- **cert-stable** — stable only for one issued cert
- **business-stable** — stable for business/organization role
- **format-unstable** — present but poor canonical identity anchor

### 6.3 Exposure classification

Classify whether the likely dedup field is:

- **public/business-public**
- **protected but low-entropy**
- **provider-local opaque**
- **sector-pseudonymous**

### 6.4 Legal/operational context

Record:

- whether the identifier is treated as personal data,
- whether a separate public business identifier exists,
- whether the identifier encodes personal traits,
- whether common public registries expose it directly or indirectly.

### 6.5 Product decision

Choose one:

- **ship now with limited-privacy language**
- **ship only for selected QTSP/profile**
- **defer pending more samples**
- **defer pending private uniqueness layer**

## 7. Protocol Guidance

### 7.1 Current-generation ZKQES

For current self-contained ZKQES registries:

- one registry per country remains the correct base pattern;
- uniqueness may be deterministic from country-local certified identity data;
- the privacy claim for the stable uniqueness anchor must be country-specific.

The protocol may still provide:

- private usage-time proofs,
- context-bound nullifiers,
- and limited exposure of certificate contents,

while honestly admitting that the stable dedup anchor is not fully hidden.

### 7.2 Future private deduplication

If we later require strong private stable deduplication, the current
self-contained model is insufficient.

That future design would require an extra hidden derivation layer, such as:

- a sector-pseudonym authority,
- a threshold PRF / OPRF service,
- or another country-specific hidden uniqueness primitive.

That is a separate protocol layer, not something implied by ordinary QES alone.

## 8. Current Working Assumptions

These are working assumptions, not permanent truths.

- **Ukraine**: assume Bucket A for present FOP/business-adjacent flows unless a
  narrower QTSP/profile review proves otherwise.
- **Austria**: treat as Bucket D conceptually; state-sector pseudonym precedent
  exists, but shipping support still requires actual certificate/profile review.
- **Germany / France / Italy / Poland**: do not assume Bucket A. Start from
  Bucket B/C and confirm with real samples.
- **Hungary**: unresolved. Policy texts suggest `serialNumber` can carry
  `TINHU-...`, but real samples must determine whether the live natural-person
  profile actually does.

## 9. Product Messaging Rule

Until a hidden derivation layer exists, the honest product statement is:

> ZKQES provides certified country-scoped uniqueness with selective disclosure,
> but the stable uniqueness anchor may remain dictionary-attackable in some
> jurisdictions.

Do not claim:

- universal private stable identity,
- pan-EU one-human-one-ID semantics,
- or strong secrecy for a deterministic public anchor derived only from civil
  identity fields.

## 10. Decision

This project is formally pivoting to:

- **per-country registry architecture**,
- **per-country identifier/privacy review**,
- **per-profile evidence-based onboarding**,
- and **country-specific privacy language**.

We are doing this because the alternative is to overclaim privacy where the
certificate identity material does not support it.

That is a product, legal, and protocol mistake. This guideline forbids it.
