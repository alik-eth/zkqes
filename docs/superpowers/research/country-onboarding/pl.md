# PL — Poland onboarding checklist

> Status: research-only. No real sample inspected. **Working bucket: B
> (sharper than DE/FR; PESEL embeds birthdate + sex).** Decision:
> defer pending real-sample review and explicit privacy-copy review.

## §6.1 Certificate field inspection

**TBD on real sample.** Required artifacts:
- Natural-person QES `.p7s` from a Polish QTSP (KIR / Szafir, EuroCert,
  CenCert, Asseco, PWPW, …).
- Leaf cert DER + intermediate DER + chain to NCCert root.

| Field | Expected source | Real value |
|-------|-----------------|------------|
| `subject.serialNumber` | per ETSI EN 319 412-1: `PNOPL-<PESEL>` or `IDCPL-…` | **TBD** |
| `dateOfBirth` extension | typically not present (PESEL encodes it) | **TBD** |
| `organizationIdentifier` | for NIP-bound business certs (`VATPL-…`) | **TBD** |
| `commonName` / `givenName` / `surname` | required | **TBD** |
| Provider-local cert serial | always present | **TBD** |

## §6.2 Stability classification

**TBD on real sample.** Working assumption:
- `subject.serialNumber` (`PNOPL-` prefix) → **person-stable**, anchored
  on PESEL (11 digits).
- PESEL is **lifelong + globally unique within PL**.
- For business: `organizationIdentifier = VATPL-<NIP>` → business-stable.

## §6.3 Exposure classification

**Working assumption: B (protected low-entropy + structural leakage).**

Why this is sharper than DE:
- **PESEL** is 11 digits, ~10¹¹ space — same entropy class as DE `IdNr`.
- BUT PESEL **embeds birthdate + sex** in the structure: digits 1-6
  are YYMMDD (with century encoded by adding offsets to MM), digit 10 is
  sex (odd = male, even = female). So a deterministic hash of PESEL
  leaks (birthdate, sex) on collision.
- PESEL is legally protected per the Polish RODO/GDPR implementation,
  but it's also the de-facto key in healthcare, banking, contracts, and
  many public registries — operational exposure is high.
- The 2024 PESEL data breaches (multi-million record leaks via private
  sector) mean a non-trivial fraction of the PL population has their
  PESEL effectively in the public domain anyway, weakening the
  dictionary-attack resistance of any protected-but-deterministic hash.

If the cert exposes `PESEL` directly, the honest privacy claim is "the
on-chain anchor is not cryptographically private; collision reveals the
underlying birthdate + sex of the user". This is a stricter framing
than DE's `IdNr` posture and product copy must reflect this.

## §6.4 Legal / operational context

- **PESEL** (Powszechny Elektroniczny System Ewidencji Ludności): assigned
  at birth to every Polish citizen + long-term residents. 11 digits.
  Encoded format: YYMMDDPPPPK where YYMMDD is birthdate (with century
  tags), PPPP is order+sex, K is checksum. Sex digit at position 10
  (odd→male, even→female).
- **NIP** (Numer Identyfikacji Podatkowej, 10 digits): tax number;
  business-public, freely searchable.
- **NCCert** (Centrum Obsługi Podpisu Elektronicznego, under the Ministry
  of Digital Affairs / KPRM) maintains the national TL. ETSI EN 319 412-1
  compliant.
- Major QTSPs: **KIR** (Krajowa Izba Rozliczeniowa; Szafir brand —
  national clearing house), **EuroCert**, **CenCert** (Asseco subsidiary),
  **PWPW** (Polska Wytwórnia Papierów Wartościowych — state security
  printer; smartcard QES focus), **Certum** (Asseco).
- Operational mode: Poland leans toward **smartcard QES** (USB tokens
  from KIR, PWPW, Certum) more than its EU peers — historical reasons
  + state-printer (PWPW) involvement. Mobile-app remote signing
  (mObywatel + mDokumenty + Szafir Mobile) is rapidly growing.

## §6.5 Product decision

**Defer.** Specifically:

1. Acquire a real PESEL-bearing QES `.p7s`. KIR's Szafir consumer
   product is the most accessible (~€20-40/year; ID verification at a
   physical KIR partner).
2. Confirm the `subject.serialNumber` actually carries `PNOPL-<PESEL>`
   and not a provider-local opaque alternative.
3. If PESEL is present → **do NOT ship** under the standard "limited
   privacy for the dedup key" framing. The structural leakage is too
   severe — a hash collision tells an attacker the user's birthdate +
   sex with certainty. Specifically mark this as "defer pending hidden
   derivation".
4. Alternative path: ship a **business-natural-person variant** keyed
   on NIP (Bucket C). This is operationally public anyway and doesn't
   require touching PESEL. May be the cleanest first-PL deploy.

## Implementation deltas if shipped (business-only)

- Per-country contract fork: `ZKQESRegistryPL`. Country const = "PL".
- bindingId derivation: keyed on NIP only for business track.
- Trust-list flatten with `--filter-country PL`. NCCert TL is
  consistently reachable.
- DOB: PL certs don't typically carry separate DOB attributes (PESEL
  embeds it); a per-country age verifier would either decode the embedded
  bits (privacy-leaky) or skip.
- i18n: add pl.json.

## References

- ETSI EN 319 412-1 v1.4.4
- Polish Act on Trust Services and Electronic Identification
  (Ustawa z dnia 5 września 2016 r.)
- PESEL algorithm: Decree of the Minister of Internal Affairs (rozp.
  MSWiA z 2014 r.)
- NCCert TL: published via the EU LOTL pointer
