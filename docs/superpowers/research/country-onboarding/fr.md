# FR — France onboarding checklist

> Status: research-only. No real sample inspected. **Working bucket: B.**
> Decision: defer pending real-sample review.

## §6.1 Certificate field inspection

**TBD on real sample.** Required artifacts:
- Natural-person QES `.p7s` from a French QTSP (Certinomis, Universign,
  ChamberSign, Docapost, …).
- Leaf cert DER + intermediate DER + chain to an ANSSI-recognized root.

| Field | Expected source | Real value |
|-------|-----------------|------------|
| `subject.serialNumber` | per ETSI EN 319 412-1: `PNOFR-…` for natural persons | **TBD** |
| `dateOfBirth` extension | ANSSI RGS profile permits but doesn't mandate | **TBD** |
| `organizationIdentifier` | only for SIRET/SIREN-bound business certs | **TBD** |
| `commonName` / `givenName` / `surname` | required | **TBD** |
| Provider-local cert serial | always present | **TBD** |

## §6.2 Stability classification

**TBD on real sample.** Working assumption:
- `subject.serialNumber` (`PNOFR-` prefix) → **person-stable** if anchored
  on `numéro fiscal` / `NIR` (social security number).
- `numéro fiscal` (13 digits, "SPI" code) is the most likely person-stable
  anchor; alternatives include the `NIR` (15 digits, INSEE-assigned).
- Provider-local serial → **cert-stable**.

## §6.3 Exposure classification

**Working assumption: B (protected low-entropy).**

Why:
- Both `numéro fiscal` (13 digits, ~10¹³ space) and `NIR` (15 digits,
  but ~10¹² effective space because the format encodes sex/birthplace/
  birth-year in fixed positions) are **low-entropy** structurally.
- `NIR` is **legally protected** under the French Code de la sécurité
  sociale (Art. L. 114-12-1) AND under CNIL guidance — its disclosure to
  third parties without legal basis is restricted. But "protected" ≠
  cryptographically private; a deterministic public hash is dictionary-
  attackable in ~hours of compute on commodity hardware.
- `NIR` additionally encodes personal traits (sex digit, birth-year-and-
  month, dept of birth) in the structure — a hash collision tells you
  the structure-encoded fields, which is itself a privacy leak.
- French law explicitly forbids `NIR`-as-public-identifier in most
  business contexts (CNIL doctrine on "interconnections de fichiers").
  Publishing a deterministic hash of NIR via on-chain protocol is in
  conflict with this doctrine even if not literally illegal.

This is a **harder Bucket B** than DE — the `NIR`'s built-in semantic
encoding makes a deterministic hash leak more than just "this user
matches that user". Recommend: do NOT ship FR until either (a) only
`numéro fiscal` (no NIR) is exposed in a verifiable QTSP profile, OR
(b) a hidden derivation layer lands.

## §6.4 Legal / operational context

- **NIR** (Numéro d'Inscription au Répertoire / numéro de sécurité sociale,
  15 digits): INSEE-assigned at birth. Format: SAAMMDDDDDCC where
  S = sex (1 or 2), AA = year, MM = month, DDDDD = dept+commune+order,
  CC = check digits. Strict legal restrictions on third-party use.
- **numéro fiscal** (SPI, 13 digits): assigned by the DGFiP (tax
  administration). Less restricted than NIR but still personal data.
- ANSSI Référentiel Général de Sécurité (RGS): version *** profile is
  the QES-equivalent. Cert profile follows ETSI EN 319 412-2; serialNumber
  format follows ETSI EN 319 412-1 (`PNOFR-` prefix for personal IDs).
- Major QTSPs: **Certinomis** (Docapost subsidiary; widely used by
  notaires + bailiffs), **Universign**, **ChamberSign**, **Docusign
  France**, **CertEurope**.
- Operational mode: France leans heavily on **remote signing services**
  (clé `e-CPS` for healthcare, "France Connect" identity bridge for
  general public). Hardware QES tokens (USB / smartcard) are still issued
  for some legal-profession contexts.
- Notable: France's *Identité Numérique La Poste* uses a separate
  ANSSI-certified eID with sector-pseudonymous derivation similar to AT —
  may warrant Bucket D treatment when reviewed (separate from the
  generic `numéro fiscal` flows).

## §6.5 Product decision

**Defer.** Specifically:

1. Acquire two paired samples: one regular QES (likely `numéro fiscal`-
   anchored), one Identité Numérique La Poste cert. Compare their
   `subject.serialNumber` fields.
2. If the regular QES exposes only a provider-local opaque serial
   (no `PNOFR-` deterministic anchor) → may be ship-able under a
   "provider-local opaque, no cross-QTSP uniqueness" disclaimer.
3. If `PNOFR-` over `numéro fiscal` → ship with limited-privacy copy in
   French ("clé d'unicité à confidentialité limitée"), but flag the
   `NIR`-encoded-trait leakage if the prefix anchors on NIR rather than
   tax ID.
4. If Identité Numérique La Poste turns out Bucket D conceptually →
   that's a separate variant worth tracking ahead of the generic France
   onboarding.

## Implementation deltas if shipped

- Per-country contract fork: `ZKQESRegistryFR`. Country const = "FR".
- Trust-list flatten with `--filter-country FR`. ANSSI's national TL
  is reachable; recent EU LOTL ingests have validated FR successfully.
- DOB encoding: deferred — French certs typically don't carry DOB
  attributes; if required, would lean on `NIR`'s embedded birth-year/
  month, which raises additional privacy concerns (don't expose the
  embedded attribute via on-chain proof).
- i18n: add fr.json. Triple-track parity with en/uk/de.
- Legal review recommended before the first FR commit lands on `main` —
  the on-chain deterministic-hash posture interacts with CNIL doctrine
  in non-obvious ways.

## References

- ETSI EN 319 412-1 v1.4.4
- ANSSI RGS v2.0 (Référentiel Général de Sécurité)
- CNIL doctrine on `NIR` use: "Limitations à l'utilisation du NIR"
- French Code de la sécurité sociale Art. L. 114-12-1
