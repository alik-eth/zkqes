# HU — Hungary onboarding checklist

> Status: research-only. No real sample inspected. **Working bucket:
> unresolved.** Decision: defer pending real-sample review.

## §6.1 Certificate field inspection

**TBD on real sample.** Required artifacts:
- Natural-person QES `.p7s` from a Hungarian QTSP (NETLOCK, NISZ Zrt.,
  Microsec, …).
- Leaf cert DER + intermediate DER + chain to NMHH-recognized root.

| Field | Expected source | Real value |
|-------|-----------------|------------|
| `subject.serialNumber` | per ETSI EN 319 412-1: `TINHU-…` (per spec §8) | **TBD — confirm** |
| `dateOfBirth` extension | likely absent | **TBD** |
| `organizationIdentifier` | for adóazonosító jel-bound business certs | **TBD** |
| `commonName` / `givenName` / `surname` | required | **TBD** |
| Provider-local cert serial | always present | **TBD** |

## §6.2 Stability classification

**Unresolved without a real sample.** Working hypothesis:
- If `subject.serialNumber` carries `TINHU-<adóazonosító jel>` (10-digit
  tax ID): person-stable, lifelong.
- If instead it carries the `személyi azonosító` (11-digit national
  identity number): also person-stable, lifelong.
- Provider-local serial → cert-stable.

The actual prefix in production HU certs is one of the open questions
flagged in the privacy guideline §8 ("policy texts suggest serialNumber
can carry TINHU-... but real samples must determine whether the live
natural-person profile actually does").

## §6.3 Exposure classification

**Unresolved.** Two distinct identifiers are in play:

- **adóazonosító jel** (10-digit tax ID): legally protected; not
  publicly searchable. Bucket B candidate by analogy with DE `IdNr`.
- **személyi azonosító jel** (11-digit national identity, embedded in
  the personal ID card): more strictly protected; EU's "Bara" / CJEU
  doctrine applies (national identity number protections are stricter
  than tax ID).
- **adószám** (11-digit business tax ID): public business identifier;
  Bucket C analogue.

The bucket assignment depends entirely on which identifier the QTSP
chooses to anchor the cert on. Until a real sample is inspected, the
decision is unresolved.

## §6.4 Legal / operational context

- **adóazonosító jel** (személyi adóazonosító jel, 10-digit tax ID):
  assigned by NAV (National Tax and Customs Administration). Personal
  data per Hungarian GDPR implementation.
- **személyi azonosító jel** (11-digit personal identifier): assigned
  at birth; tied to identity card. Restricted use under
  1996/XX törvény and subsequent amendments.
- **adószám** (11-digit, "VAT number"): business; public.
- **NMHH** (Nemzeti Média- és Hírközlési Hatóság) maintains the national
  TL via NMHH Trusted Service Authority. Hungary's TL signing process is
  documented at `https://nmhh.hu/cikk/132237/`.
- Major QTSPs: **NETLOCK** (privately-held; largest by volume),
  **NISZ Zrt.** (state-owned IT systems holding company; provides
  e-government QES), **Microsec** (smaller, healthcare-focused).
- Operational mode: Hungary's eID is centered around the **eSzemélyi**
  (electronic personal identity card) — a smartcard issued by the state.
  QES via eSzemélyi is the dominant flow; remote signing (mobile-app)
  is supported by NETLOCK and others but less dominant.

## §6.5 Product decision

**Defer.** Specifically:

1. Most urgent open question: which identifier prefix do live
   eSzemélyi-issued QES certs use? `TINHU-<adóazonosító>` per spec
   suggestion vs `IDCHU-<személyi azonosító>` vs a provider-local
   opaque is what determines the bucket.
2. Secondary: confirm whether NETLOCK (private) and NISZ (state) follow
   the same `subject.serialNumber` convention or diverge.
3. Pending those answers, any ship decision is premature.
4. eSzemélyi flows that go through the central state issuer (NISZ) may
   warrant a separate per-QTSP review — state-issued vs commercial
   QTSPs may produce structurally different cert profiles.

## Implementation deltas if shipped

- Per-country contract fork: `ZKQESRegistryHU`. Country const = "HU".
- Trust-list flatten with `--filter-country HU`. NMHH TL has had
  intermittent reachability issues in past EU LOTL ingests; budget
  retry-with-cache for the flatten step.
- DOB: deferred.
- i18n: add hu.json.

## References

- ETSI EN 319 412-1 v1.4.4
- Hungarian eIDAS implementation: 2015. évi CCXXII. törvény
- NMHH Trusted Service Authority: `https://nmhh.hu/cikk/132237/`
- eSzemélyi documentation: `https://magyarorszag.hu/jszp/eszemelyi`
