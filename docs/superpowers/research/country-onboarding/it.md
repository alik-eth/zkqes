# IT — Italy onboarding checklist

> Status: research-only. No real sample inspected. **Working bucket: B
> for personal certs, C for business/professional certs.** Decision:
> defer pending real-sample review; business-natural-person variant may
> be ship-ready ahead of personal.

## §6.1 Certificate field inspection

**TBD on real sample.** Required artifacts:
- Natural-person QES `.p7s` from an Italian QTSP (Aruba PEC, InfoCert,
  Namirial, Poste Italiane, Intesi Group, Visura, …).
- Leaf cert DER + intermediate DER + chain to AgID-recognized root.

| Field | Expected source | Real value |
|-------|-----------------|------------|
| `subject.serialNumber` | per ETSI EN 319 412-1: `TINIT-…` | **TBD** |
| `dateOfBirth` extension | included by some QTSPs (Poste Italiane), elided by others | **TBD** |
| `organizationIdentifier` | for partita IVA-bound business certs (`VATIT-…`) | **TBD** |
| `commonName` / `givenName` / `surname` | required | **TBD** |
| Provider-local cert serial | always present | **TBD** |

## §6.2 Stability classification

**TBD on real sample.** Working assumption:
- `subject.serialNumber` (`TINIT-` prefix) → **person-stable**, anchored
  on `codice fiscale` (16-character alphanumeric).
- `codice fiscale` is **deterministically derivable from name + DOB +
  birthplace** — itself a leakage concern (anyone who knows the name
  + DOB + birthplace can compute the codice fiscale offline).
- For business certs, `organizationIdentifier = VATIT-<partita IVA>` →
  **business-stable**; rotates only on entity restructuring.

## §6.3 Exposure classification

**Personal: B (protected low-entropy with derivability hazard).**
**Business-natural-person: C (separate public business identifier).**

Why personal is B-narrow:
- `codice fiscale` is derivable from public-ish data (most Italian-name +
  DOB + birthplace combos enumerate to a unique codice fiscale via the
  published algorithm). The space is ~10¹⁶ but the *practical* search
  space for a known target is ~thousands (their possible birth dates
  near a known year × names of relatives × birthplaces).
- A deterministic hash of `codice fiscale` is therefore not just
  dictionary-attackable in the abstract — it's reversible to within a
  few candidates given any partial public information about the person.
- `codice fiscale` is also embedded on every Italian invoice, contract,
  and tax document — its operational exposure is much higher than
  DE `IdNr` or FR `NIR`.
- AgID's eIDAS profile (DPCM 22 febbraio 2013) does not require strong
  protection of `codice fiscale` — the regulator treats it as
  semi-public.

Why business is C:
- `partita IVA` (11 digits) is **operationally public** — printed on
  every Italian business website, invoiced commercially, and freely
  searchable via the AgenziaEntrate VIES portal.
- A separate `organizationIdentifier` slot in the cert means business
  flows can be cleanly distinguished from personal flows.

## §6.4 Legal / operational context

- **codice fiscale** (Italian fiscal code, 16 alphanumeric): assigned
  to every Italian resident; deterministically derivable from name + DOB
  + sex + birthplace per the Decreto del Ministero delle Finanze 23
  dicembre 1976. Used as universal identifier in healthcare, schools,
  contracts, banking.
- **partita IVA** (VAT number, 11 digits): public business identifier;
  searchable.
- **AgID** (Agenzia per l'Italia Digitale) maintains the national TL.
  ETSI EN 319 412-1 / 412-2 compliant; `subject.serialNumber` typically
  prefixed `TINIT-` for natural persons.
- Major QTSPs: **InfoCert** (Tinexta subsidiary; largest by volume),
  **Aruba PEC**, **Namirial**, **Poste Italiane**, **Intesi Group**.
  Italy has the largest QES user base in EU per AgID stats (>10M users).
- Operational mode: Italy uses both **remote signing** (FirmaCerta,
  ArubaSign Remoto) and **smartcard QES** widely. Mobile-app remote
  signing is dominant for new issuances.

## §6.5 Product decision

**Two-track:**

1. **Business-natural-person variant** (cert with `organizationIdentifier
   = VATIT-…`): ship-ready under "operationally public business
   identifier" framing. Defer only on a missing real sample. Bucket C.

2. **Personal-only variant** (cert with no `organizationIdentifier`,
   `subject.serialNumber = TINIT-<codice fiscale>`): defer pending
   either (a) a hidden-derivation layer or (b) explicit product copy
   accepting that the on-chain anchor is reversible-in-practice.
   Italian-language i18n must NOT claim privacy in the personal variant.

## Implementation deltas if shipped (business track first)

- Per-country contract fork: `ZKQESRegistryIT`. Country const = "IT".
- bindingId derivation should consider whether to include the
  `partita IVA` separately for the business track (e.g.,
  `keccak256(abi.encode("IT-VAT", partitaIva))` for business) — gives a
  stable, operationally-public dedup key without touching `codice fiscale`
  at all. Spec amendment needed if we go this way.
- Trust-list flatten with `--filter-country IT`.
- DOB: deferred; some QTSPs (Poste Italiane) include DOB attributes that
  would warrant a per-country age verifier, but this requires a separate
  ceremony per circuit.
- i18n: add it.json.
- AgID has historically been responsive to research/protocol questions —
  proactive engagement before deploy is recommended.

## References

- ETSI EN 319 412-1 v1.4.4
- DPCM 22 febbraio 2013 (Italian eIDAS implementation)
- D.M. Finanze 23 dicembre 1976 (codice fiscale algorithm)
- AgID elenchi pubblici: `https://eidas.agid.gov.it/TL/TSL-IT.xml`
