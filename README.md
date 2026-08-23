> ⚠️ **PUBLIC DEMO NOTICE**: This repository contains a **sanitized reference implementation** of the Sentinel Care architecture. 
> It is designed for educational and partnership evaluation purposes only. 
> **DO NOT** use this code or configuration for storing real patient data without full security auditing and production-hardening.

# SentinelCare

Sentinel Care is a privacy-first, HIPAA/GDPR-compliant healthcare platform with neuro-inclusive design, built on zero-knowledge encryption principles. Note on Zero-Knowledge: The local demo simulates the encryption flow. In the full production build, encryption keys are generated client-side and never transmitted to the server, ensuring true zero-knowledge compliance.

**Partnership Inquiry Context:** This project is being presented to Proton for potential strategic alignment as a privacy-first healthcare platform. Sentinel Care is designed to complement the Proton ecosystem by providing a dedicated clinical application layer, driving adoption of Proton's privacy infrastructure (Mail, Drive, Pass) within the healthcare sector.


## Architecture

| Area | Implementation |
| --- | --- |
| API | Spring Boot 3, Java 21, REST under `/api/v1` |
| Database | PostgreSQL 16, schema managed by Flyway |
| Auditing | Hibernate Envers (`patients_aud` and `revinfo`) |
| Authentication | OAuth2 resource server with bearer JWTs |
| Client | Flutter |

Envers records every persisted patient, GDPR-request, and security-event create, update, and delete with the authenticated actor and role in `revinfo`. The revision history endpoint is `GET /api/v1/patients/{id}/revisions` and requires `SCOPE_audit.read` or `ROLE_AUDITOR`. Operational events are written via `POST /api/v1/audit-events` and are themselves Envers-audited—there is no custom hash-chain audit store. GDPR erasure requests are recorded as audited entities; retention overrides are applied via a configurable jurisdiction policy layer.

## Audit trail and integrity
Sentinel Care does not implement a custom tamper-proof audit store, and we don't claim one. Audited history is provided by Hibernate Envers: it records a full revision history of audited entities, including consent, erasure, and file access (VIEW) events.
On top of Envers, the demo computes a SHA-256 digest chain over the recorded revision sequence. Each block's digest is computed from its own audited fields plus the previous block's digest, so the sequence can be verified end to end: any revision changed after recording, without recomputing its digest, breaks the chain. The tamper-detection view exercises exactly this check.
What the chain proves, stated plainly:
It detects corruption, partial writes, and edits that don't recompute the digests. Verification is a consistency check over the demonstrated sequence.
It does not prove tamper-resistance against someone who can write to the database. Records and digests live in the same store, so a DBA with write access can rewrite a revision, recompute the chain, and pass verification. This is integrity checking, not chain of custody.

Production hardening (out of scope for this reference implementation, which uses mocked auth and simulated encryption throughout): server-side HMAC keys over the digests, and a monthly anchor hash published outside the database so the chain has an external witness.

## 🌟 Key Features Showcased

This demo highlights the following architectural patterns:

| Feature | Component File | Description |
| :--- | :--- | :--- |
| **Immutable Audit Trail** | `AuditLogsView.tsx` | SHA-256 hash-chain verification to detect tampering. |
| **GDPR Right to Erasure** | `GDPRManager.tsx` | Dual-compliance logic for HIPAA retention vs. GDPR deletion. |
| **Vision Privacy Lock** | `CameraSafetySystem.tsx` | Client-side face detection to prevent shoulder surfing. |
| **Secure Consult Mode** | `ConsultModeManager.tsx` | Dynamic field masking based on clinical role & session context. |
| **Offline-First Sync** | `SyncEngineManager.tsx` | Conflict resolution and optimistic locking for disconnected clinics. |

*Explore the `components/` directory to see how these patterns are implemented in React.* 

## Local development

1. Start PostgreSQL: `docker compose up -d postgres`.
2. This demo uses mocked authentication. In a real deployment, you must wire a managed OIDC provider (e.g., Auth0, Keycloak, or Proton Pass) and configure spring.security.oauth2.resourceserver.jwt.issuer-uri. Do not use the default local settings for production.
3. With Java 21 and Maven installed, run `cd backend; mvn spring-boot:run`.
4. With Flutter installed, run `cd mobile; flutter run --dart-define=API_BASE_URL=http://localhost:8080 --dart-define=ACCESS_TOKEN=<token>`.

Never put access tokens, database credentials, SSNs, or medical-record exports in source control. Wire a managed OIDC provider and a secret manager before deployment.

## Compliance
All patient data encrypted at rest (PostgreSQL TDE or column-level encryption)
Immutable audit trail via Hibernate Envers (actor, role, and timestamp recorded)
GDPR erasure and HIPAA retention rules enforced at the service layer
Designed for zero-knowledge: Proton cannot decrypt patient data even when integrated as a storage layer
