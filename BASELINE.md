# Product Baseline

This product was created from the `juanimolfino/ai-saas-base` template.

## Local Remotes

The product repository uses:

```bash
origin  https://github.com/juanimolfino/headshots-ai.git
base    https://github.com/juanimolfino/ai-saas-base.git
```

`origin` is the product source of truth. `base` is only a reference remote for comparing or porting template improvements.

## Update Model

Changes in `ai-saas-base` do not automatically affect this product. Bring them in intentionally.

Recommended process:

1. Review the base change.
2. Decide whether this product needs it.
3. Port the smallest useful patch manually or cherry-pick a specific base commit.
4. Run `npm run test`, `npm run build`, and relevant integration checks.
5. Commit with a message like:

```text
Port base update: <short description>
```

## Future Direction

For now, we use manual porting. If several products repeatedly need the same updates, migrate to one of these models:

- Add `ai-saas-base` as an upstream remote in every product and cherry-pick shared fixes.
- Extract stable shared modules into versioned packages once APIs are clear.
- Move to a monorepo only if products need tightly coordinated shared development.

The base repository documents the full strategy in `BASE_MAINTENANCE.md`.

