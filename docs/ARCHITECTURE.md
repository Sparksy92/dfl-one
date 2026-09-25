# DFL-One Architecture Specification

## Authority Contract

> **DFL-One composes independently deployable DFL products into a unified experience. Products retain ownership of their business semantics, databases, authorization and domain invariants. DFL-One owns product discovery, trusted route resolution, composition metadata, entitlement-based presentation and cross-product experience coordination.**

## Architectural Boundaries

1. **System-of-Record Independence**: DFL-One does NOT own product business databases. CRM (`dfl-crm`) and Commerce (`dfl-commerce`) maintain their own isolated PostgreSQL databases and domain logic.
2. **Identity & Authorization Separation**: DFL-One relies on Keycloak (`rezhub-auth`) for authentication and product-native RBAC/RLS for authorization. Entitlements in DFL-One control presentation visibility only, NOT domain permissions.
3. **Product Registry Trust Model**: Manifests describe product capabilities, but DFL-One's server-side Product Registry validates and enforces allowed origins, expected versions, and trusted route keys.
