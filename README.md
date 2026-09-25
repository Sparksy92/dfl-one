# DFL-One — Unified Enterprise Composition Platform

## Authority Contract & Governance Boundary

> **DFL-One composes independently deployable DFL products into a unified experience. Products retain ownership of their business semantics, databases, authorization and domain invariants. DFL-One owns product discovery, trusted route resolution, composition metadata, entitlement-based presentation and cross-product experience coordination.**

### Non-Goals & Invariants

DFL-One is **NOT**:
- A CRM or Commerce application.
- An Agency Portal or business System-of-Record.
- A shared product database or cross-domain query engine.
- A replacement for Keycloak (Identity) or `tribe-kanban` (Task/Command control plane).
- An entitlement authority that grants domain-level permissions.
- A generic integration or ESB database.

---

## Workspace Structure

```text
dfl-one/
├── README.md
├── package.json
├── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md
│   └── PRODUCT_REGISTRY.md
├── contracts/
│   ├── generated/
│   │   └── dfl-product-manifest.v1.json
│   └── SOURCE.json
├── fixtures/
│   ├── crm.manifest.json
│   └── commerce.manifest.json
└── packages/
    └── product-registry/
        ├── package.json
        ├── src/
        │   ├── types.ts
        │   ├── registry.ts
        │   ├── manifest-validator.ts
        │   ├── route-resolver.ts
        │   ├── entitlement-filter.ts
        │   └── errors.ts
        └── tests/
```

---

## Licensing & Architecture

Part of the **DFL Enterprise Modular Product Family**.
