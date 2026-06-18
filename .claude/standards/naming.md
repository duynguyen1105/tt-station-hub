# Naming Conventions

| Kind       | Convention                         | Example                  |
| ---------- | ---------------------------------- | ------------------------ |
| Components | kebab-case file & PascalCase export| `PdfReviewStep.tsx`      |
| Hooks      | `use` prefix, camelCase            | `useBulkGenerate.ts`     |
| Services   | kebab-case file                    | `pdf-job-service.ts`     |
| API routes | `route.ts` in feature directory    | `app/enquiries/route.ts` |
| DB columns | snake_case                         | `property_reference`     |
| TS fields  | camelCase                          | `propertyReference`      |

**Boundary rule:** snake_case only lives at the database/wire boundary. Convert to camelCase as soon as data enters TypeScript.
