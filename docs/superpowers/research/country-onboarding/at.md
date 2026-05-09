# AT — Austria onboarding checklist

> Status: research-only. No real sample inspected. **Working bucket: D
> conceptually (sector-pseudonymous via Stammzahl → bPK), but cert
> behavior in practice is unconfirmed.** Decision: defer pending real-
> sample review.

## §6.1 Certificate field inspection

**TBD on real sample.** Required artifacts:
- Natural-person QES `.p7s` from an Austrian QTSP (Handy-Signatur /
  ID Austria, A-Trust, GlobalTrust, …).
- Leaf cert DER + intermediate DER + chain to a-sit / RTR-recognized root.

| Field | Expected source | Real value |
|-------|-----------------|------------|
| `subject.serialNumber` | per ETSI EN 319 412-1: format unconfirmed for AT — possible `IDCAT-` or sector-bPK-derived | **TBD — high priority** |
| `dateOfBirth` extension | sometimes present; sometimes redacted in favor of bPK derivation | **TBD** |
| `organizationIdentifier` | for company-bound certs | **TBD** |
| `commonName` / `givenName` / `surname` | required | **TBD** |
| Provider-local cert serial | always present | **TBD** |

The KEY question: does the cert carry the **Stammzahl** (the hidden
base identifier) or only a **bPK** (sector-specific derived identifier)?
This single field determines whether AT actually realizes the Bucket D
posture or collapses into Bucket B.

## §6.2 Stability classification

**TBD on real sample.** Architectural framing (per Austrian E-Government
law / E-GovG):
- **Stammzahl**: the underlying base identifier, derived from ZMR (central
  registry) but stored only in encrypted form on the citizen's eID;
  NEVER shared with relying parties directly.
- **bPK** (bereichsspezifisches Personenkennzeichen, sector-specific
  personal identifier): derived from Stammzahl + sector code; different
  per service domain so cross-sector linkage is cryptographically
  infeasible without re-deriving from Stammzahl.
- Person-stable in either case (Stammzahl is lifelong; bPK is lifelong
  per sector).

## §6.3 Exposure classification

**Working assumption: D (sector-pseudonymous).** This is the only
bucket-D candidate among the six countries.

Why D works in principle:
- The bPK-by-sector design is a **textbook implementation of sector
  pseudonymization** — a state-mandated hidden derivation layer.
- ZKQES going on-chain in a "sector" called e.g. `qkb-zkqes-at-v1`
  would receive a bPK that's cryptographically unlinkable from any
  bPK in any other sector (banking, healthcare, tax, …).
- This delivers genuine "anonymous stable identifier" semantics in the
  spec §3.1 sense.

Why this might collapse in practice:
- If the actual Austrian QES cert profile carries the **Stammzahl**
  directly in `subject.serialNumber` (rather than a sector-derived
  bPK), the privacy story is destroyed — the Stammzahl is a strict
  super-identifier whose exposure violates E-GovG.
- Some early A-Trust certs were known to carry tax-ID-like fields
  rather than bPKs; whether modern ID Austria certs do the same is
  the open empirical question.

## §6.4 Legal / operational context

- **E-Government-Gesetz (E-GovG)** §6 / §6a / §13a: defines Stammzahl +
  bPK derivation. Bypass / direct-Stammzahl-disclosure is a regulatory
  violation.
- **Stammzahl** = E(symmetric encryption of CRR/SCR base ID), embedded
  in the citizen's HSM-protected eID.
- **bPK** (bereichsspezifisches Personenkennzeichen) = Hash(Stammzahl ||
  sector-tag). Derived inside the eID HSM; the relying party only ever
  sees the bPK, never the Stammzahl.
- Sector tags are managed by the federal Datenschutzbehörde (DSB);
  applications register a sector and receive a deterministic bPK domain
  separator.
- Federal eID rebranded **2023: ID Austria** (from the prior Handy-Signatur
  + Bürgerkarte stack). RTR (Rundfunk und Telekom Regulierungs-GmbH)
  maintains the national TL.
- Major QTSPs: **A-Trust** (private; primary supplier for Handy-Signatur
  and now ID Austria certs), **GlobalTrust** (formerly e-commerce
  monitoring), **PrimeSign** (formerly LIBSign).
- Operational mode: dominantly **mobile-app remote signing via ID Austria**
  (formerly Handy-Signatur). Smartcard QES (Bürgerkarte) is being phased
  out. Notable: ID Austria binds the cert to a specific device pin/HSM
  — re-issuance on device rotation, but the underlying Stammzahl/bPK
  derivation persists.

## §6.5 Product decision

**Defer pending real cert review — this is high-priority research because
AT is potentially the only Bucket D country in scope.**

1. Acquire a real ID Austria QES `.p7s` from a private natural person
   (signing flow via the ID Austria app + a non-government relying
   party).
2. Inspect `subject.serialNumber` and any other identity-bearing
   extension. Determine whether the cert exposes a Stammzahl, a generic
   bPK, or a per-QTSP opaque.
3. Cross-check with A-Trust's published cert profile documentation.
4. **If the cert exposes a clean QES-sector bPK** → ship as the first
   Bucket-D country. Privacy claim: "sector-pseudonymous; on-chain
   anchor cannot be linked across sectors via the QES alone".
5. **If the cert exposes Stammzahl** → defer indefinitely; technical fix
   would require coordinating with the federal DSB to register a new
   sector for ZKQES, which is an organizational integration not a
   protocol change.
6. **If neither** (provider-local opaque) → may still ship under a more
   limited "no cross-cert uniqueness" framing.

## Implementation deltas if shipped

- Per-country contract fork: `ZKQESRegistryAT`. Country const = "AT".
- bindingId derivation: `keccak256(abi.encode("AT", identityFingerprint))`
  — but `identityFingerprint` is over the bPK, not Stammzahl, so the
  cross-country property holds (different sectors get different bPKs).
- Trust-list flatten with `--filter-country AT`. RTR's TL is reliably
  reachable.
- DOB: ID Austria carries DOB attributes. Per-country age verifier
  feasible if the AgeDiia ceremony pattern is replicated for AT — would
  warrant a separate amendment + ceremony.
- i18n: add de-AT.json (or share de.json + add AT-specific strings).
- Recommend pre-deploy contact with the DSB to confirm sector
  registration for the on-chain protocol — the bPK derivation must be
  blessed for the ZKQES sector tag, otherwise relying parties may
  receive a nonsense bPK.

## References

- ETSI EN 319 412-1 v1.4.4
- Austrian E-Government-Gesetz §6, §6a, §13a
- ID Austria documentation: `https://www.oesterreich.gv.at/themen/dokumente_und_recht/id-austria.html`
- A-Trust cert profile: `https://www.a-trust.at/de/zertifikate/`
- RTR TSP register: `https://www.rtr.at/TKP/aktuelles/news/tsp_register.html`
