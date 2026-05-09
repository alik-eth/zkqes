# DE — Germany onboarding checklist

> Status: research-only. No real sample inspected. **Working bucket: B
> or C (depending on which cert variant gets reviewed).** Decision:
> defer pending real-sample review.

## §6.1 Certificate field inspection

**TBD on real sample.** Required artifacts:
- Natural-person QES `.p7s` from a German QTSP (D-Trust, Bundesdruckerei,
  T-Systems, …).
- Leaf cert DER + intermediate DER + chain to a BSI-recognized root.

Fields to record once a sample arrives (per spec §6.1):

| Field | Expected source | Real value |
|-------|-----------------|------------|
| `subject.serialNumber` (OID 2.5.4.5) | per ETSI EN 319 412-1: `IDCDE-…` or `PNODE-…` prefix | **TBD** |
| `dateOfBirth` extension | possibly absent (DE certs often elide) | **TBD** |
| `organizationIdentifier` | present iff business-natural-person variant | **TBD** |
| `commonName` / `givenName` / `surname` | required for QES | **TBD** |
| Provider-local cert serial | always present | **TBD** |
| SPKI stability across renewal | requires two paired samples | **TBD** |

## §6.2 Stability classification

**TBD on real sample.** Working assumption:
- `subject.serialNumber` (if `IDCDE-` or `PNODE-` prefixed) → **person-stable**
  — derived from the federal `IdNr` per BSI cert profile.
- `dateOfBirth` if present → **person-stable**.
- Provider-local cert serial → **cert-stable** (rotates per renewal).

## §6.3 Exposure classification

**Working assumption: B (protected low-entropy)** for personal `IdNr`-derived flows.

Why:
- Steuer-IdNr (`IdNr`, 11 digits) is **legally protected personal data**
  per § 139b AO. Not a public identifier.
- Wirtschafts-IdNr (`W-IdNr`, opens with `DE…`) is **publicly linked to
  business filings** at the Bundesanzeiger / Handelsregister — separate
  exposure model (Bucket C for business-natural-person flows).
- Both are low-entropy structurally — 11 digits → ≤ 10¹¹ space, well
  within dictionary-attack range for a deterministic public hash.

A deterministic public hash of `IdNr` is **not** a strong privacy claim
even though `IdNr` itself is "protected" — protected ≠ cryptographically
private.

If the leaf cert exposes `IdNr` directly via `subject.serialNumber`, this
country falls in **Bucket B** and the honest copy is "limited privacy
for the stable dedup key — `IdNr` hash is dictionary-attackable in the
~10¹¹ space".

If a separate `W-IdNr`-keyed business-natural-person variant exists and
is cleanly distinguishable in the cert profile, the business variant is
**Bucket C** (business identifier is operationally public anyway → ship
with public-uniqueness language).

## §6.4 Legal / operational context

- **Steuer-IdNr** (§ 139b Abgabenordnung): assigned to every natural
  person; valid for life; legally protected from public disclosure.
- **Wirtschafts-IdNr** (§ 139c AO; rolling out 2024-2026 per BMF
  schedule): public business identifier, linked to the federal commercial
  register.
- BSI eIDAS profile: ETSI EN 319 412-2 Q-cert with `subject.serialNumber`
  prefix `IDCDE-` (TIN) or `PNODE-` (national ID) per ETSI EN 319 412-1.
  See `https://www.bsi.bund.de/EN/Topics/ElectronicIdentities/Trust_Services/`.
- Major QTSPs: **D-Trust** (Bundesdruckerei subsidiary; primary supplier
  for federal e-IDs and e-signatures), **T-Systems**, **Bundesnotarkammer
  Zertifizierungsstelle**, **DGN Service GmbH**, **medisign GmbH**.
- Operational mode: most German QES flows use a **remote signing service
  (Fernsignatur)** — the cert lives in the QTSP HSM and the user
  authenticates via mobile app / SMS OTP. ETSI EN 419 241-1 compliant.
- Hardware-token QES (USB cards) is rarer, used in legal-profession
  contexts (BeA / EGVP).

## §6.5 Product decision

**Defer pending real sample.** Specifically:

1. Acquire one real `IdNr`-bearing QES `.p7s` from a private natural
   person. D-Trust's ID pkit + a personal identity cert is the most
   accessible path (~€60-150 for a 1-3 year cert).
2. Inspect `subject.serialNumber` to confirm the prefix actually used
   today (ETSI says `IDCDE-` is allowed; some QTSPs may use a
   provider-local convention instead).
3. If `IdNr` is in the cert → publish as **Bucket B**, ship with
   limited-privacy product copy (German-language i18n: "begrenzt private
   eindeutige Anker-Hash").
4. If only a provider-local opaque serial is in the cert → re-review;
   may move to a "provider-local opaque" classification not covered by
   the four-bucket model.

## Implementation deltas if shipped

- Per-country contract fork: `ZKQESRegistryDE`. Country const = "DE".
  bindingId derivation: `keccak256(abi.encode("DE", identityFingerprint))`.
- Trust-list flatten with `--filter-country DE` against the EU LOTL
  (LOTL `<TSLLocation>` for DE points to the BNetzA-published German
  TL, which is signed by BNetzA under a BSI-rooted chain).
- DOB encoding: deferred — most German certs elide `dateOfBirth`. No
  per-country age verifier (`Binding.dobSupported = 0`) until the
  attribute lands in production cert profiles.
- i18n: en.json + uk.json + new de.json. All three must carry the
  same key set.
- Existing `multi-qtsp-facade-design` plan covers the QTSP catalog UI;
  add a DE QTSP row with `state: 'silver'` until the ceremony fires.

## References

- ETSI EN 319 412-1 v1.4.4 (TIN format `<TYPE><CC>-…`)
- BSI TR-03145 (Q-Cert profile)
- § 139b, § 139c AO (German fiscal code)
- BNetzA TL: published at `https://tl.bundesnetzagentur.de/`
