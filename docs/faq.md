# Frequently asked questions

A reference for questions that arrive often enough to deserve a written answer. Short-form Q&A surface; long-form reference lives under `/reference`.

---

## What happens when my QES expires?

Every qualified electronic signature carries a `notAfter` date — the issuing trust service provider's cap on how long the certificate is valid. EU QTSPs typically issue qualified certificates with a one-to-three-year validity. When that date passes, the certificate is no longer accepted by Adobe Reader, eIDAS-aware verifiers, or — relevantly here — the `zkqes` registration flow.

What this means in practice depends on whether you are looking backward at an already-registered binding, or forward at a new registration.

### Already registered before expiry

Your existing binding remains valid. The on-chain registry recorded that a `zkqes` proof was verified at the moment of registration, when your certificate was within its `notBefore` and `notAfter` window. Once the registry has accepted the proof, no later certificate event — expiry, revocation, key rotation — invalidates the recorded nullifier or the citizen certificate you minted from it.

This is by design. Registration is a permanent statement that, at registration time, you held a valid qualified signature from an authorised intermediate of your country's trust list. It is not a continuous attestation. The chain does not poll the QTSP's revocation list and does not re-check `notAfter`. Once registered, you are registered.

### Registering after expiry

You cannot register with an expired certificate. The circuit's binding parser checks `notAfter` against the registration timestamp; an expired certificate fails the proof. Equivalently, the trust-list Merkle gate on chain only accepts intermediates whose currently-valid certificates anchor to a published QTSP — if your leaf certificate is past `notAfter`, no proof generated from it will satisfy the gate.

The remedy is the same remedy any holder of an expired qualified certificate makes: renew through your QTSP. The renewal flow is QTSP-specific and outside `zkqes`'s control.

### Renewal flows by QTSP

- **Ukraine — Diia.** Open the Diia mobile app, navigate to the electronic identity entry, and follow the renewal prompt. The renewed certificate is issued under the same `subject.serialNumber` (your tax identifier), so the wallet-bound nullifier you would derive from a renewed certificate collides with your prior registration. The intended path after renewal is to keep the existing wallet binding, not to register again.

- **Other EU/EEA QTSPs.** Each member state's qualified trust service providers operate their own renewal channels; consult your QTSP's documentation directly. The facade-level fact remains constant across the eIDAS perimeter: a renewed certificate produces a fresh `notBefore`/`notAfter` window, but the same `subject.serialNumber`, so `zkqes`'s nullifier derivation is stable across renewals.

### Edge cases

- **Wallet rotation across an expiry boundary.** If you registered with a then-valid certificate and the certificate has since expired, the `/account/rotate` flow is unavailable until you renew — rotation requires a fresh proof from a currently-valid certificate. This is a deliberate constraint: rotation re-anchors the binding to a new wallet, and re-anchoring requires a fresh signed statement.

- **Lost certificate.** If you lose access to your QES — forgotten credentials, lost device — before renewing, your existing binding remains valid on chain but you cannot rotate. Recovery is QTSP-specific; for Diia, see the official "Втрата доступу" (loss of access) flow.

- **Revoked certificate.** Revocation behaves the same as expiry for `zkqes`'s purposes. Prior registrations stand; new registrations and rotations fail until a fresh certificate is issued.
