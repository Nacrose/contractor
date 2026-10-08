# ADR-0009: Scoped business grants and separate grant authority

Date: 2026-09-30  
Status: Accepted for the people/access overhaul; runtime cutover is pending.

## Context

The application has several independent permission sources: organization role/function fields, organization JSON tab grants, project role strings, project JSON module/tab grants, router-specific checks, and UI visibility. A title or role can consequently imply broad access in one path while another path applies a narrower matrix. Organization membership is also confused with permission to read organization business data in some shell and query paths.

The product requires small owner-operated organizations, larger organization teams, project-only staff, and staff who work across organization and project scopes with different authority. Project heads need local onboarding and delegation without being able to grant organization access or exceed an approved ceiling.

## Decisions

1. **A user is an actor; a title is not authority.** The existing `User.orgRole`, project role, title, and position strings are transitional administration/display data. Long-term business authorization comes from explicit grants. A system owner is a separate administration/recovery capability and still needs explicit business grants for project information.
2. **Organization and project scopes are independent.** An organization grant applies only to organization resources. A named-project grant requires that project enrollment. A deliberately provisioned `all_projects` grant may authorize project actions without fabricating membership rows. A missing project ID never means wildcard.
3. **Use stable action keys.** A code-owned catalog defines permission keys, scope, resource family, and sensitivity. Labels, URLs, UI tabs, and title strings are not keys. View/edit presets expand into concrete action keys; sensitive, approval, payment, export, delete, and access-administration actions remain separate.
4. **Normalize grants and preserve provenance.** `AccessGrant` rows carry allow/deny, scope, validity, optional supported record constraints, revision, issuer/revoker, reason, and template provenance. Unknown catalog keys fail closed. Explicit deny wins over matching allow, including a project deny over an all-project allow. Expiry and revocation are checked on every server authorization.
5. **Separate the power to grant from business access.** `GrantAuthority` defines what a person may delegate, to whom/scope, and for how long. A project business permission alone cannot authorize issuing grants. Project heads stay inside their delegation ceiling and cannot grant org/all-project/owner/platform privileges.
6. **Templates are immutable snapshots, not roles.** A template revision stores a reviewed permission snapshot. Applying one creates independent grants with source provenance; later template or recipient edits do not mutate other users. Archived templates retain history.
7. **Account identity is never transferred.** A departing user's account is suspended and its sessions revoked; a replacement gets a new account or uses their own pre-existing account. Handover changes eligible current assignments while retaining the original actor on historical records.
8. **Authority is revalidated at commit.** Mutations sensitive to revocation evaluate current grants inside the transaction that commits the mutation. Frontend state is a projection and never authorizes a request.
9. **Migration is explicit and reviewable.** Existing JSON grants and role fallbacks must be inventoried and converted with an access diff before runtime cutover. Ambiguous authority is not guessed. The new schema is currently additive and dormant; it is not a second live authority engine.

## Persistence and invariants

The first additive schema step introduces `AccessGrant`, `GrantAuthority`, `AccessTemplate`, and immutable `AccessTemplateRevision` records. SQL constraints enforce scope/project consistency and validity ranges. Triggers enforce tenant consistency across subject, issuer, project, and template references. FORCE RLS isolates each record by its organization. `all_projects` is an explicit enum scope with a null `projectId`; organization and project references never cross tenant boundaries.

The schema does not yet implement the full identity and hierarchy model. Person/employment separation, dated position occupancy, project deployment history, dated reporting edges, approval-policy snapshots, and the account onboarding/outbox transaction are separate dependent work and must be completed before the overhaul is release-ready.

## Consequences

- Smaller organizations need an explicit setup flow that grants the named operators organization and all-project actions. Adding a new operator does not silently make them an owner.
- Project navigation and endpoints must both use the same evaluator; hiding a menu item is insufficient.
- Root-to-module mappings are only an inventory aid. Mixed-scope routers and procedure-specific actions require resource resolution and explicit permission metadata.
- Owner-led financial workflows retain direct execution without self-approval, while audit, posting locks, capability checks, and amount limits remain independent.
- The migration is not considered verified until applied to a disposable database with RLS and cross-tenant negative cases.

## Supersedes

This decision supersedes ADR-0005 where the earlier fixed role triad or implicit owner/project-role paths are treated as durable business authorization. ADR-0004 and ADR-0006 remain authoritative for operating capabilities, workflow policy, fiscal locks, financial limits, and separation of duties; a business grant never bypasses those controls.
