# Trusted Product Registry Specification

## ProductRecord v1 Metadata Model

```typescript
export interface ProductRecord {
  product_id: string;
  manifest_version: string;
  expected_product_version: string;
  allowed_origins: string[];
  health_endpoint: string;
  trusted_route_keys: string[];
  entitlement_requirements: string[];
  enabled: boolean;
}
```

## Security Invariants

1. **Fail-Closed Validation**: Manifests from unknown product IDs, unexpected product versions, or non-HTTPS / unapproved origins are immediately rejected.
2. **No Remote Code Execution**: Manifest fields attempting to specify remote script URLs (e.g. `component_entry`) trigger immediate schema rejection.
3. **Route Key Resolution**: Shell UI routes are resolved strictly through pre-approved `trusted_route_keys`. Syntactically valid routes not listed in the registry record fail resolution.
4. **Zero Business Record Storage**: The Product Registry maintains composition metadata only. It contains no customer, person, order, or financial records.
