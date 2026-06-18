# Performance

Project-specific constraints only — generic web performance best-practices are out of scope here.

## Images

- Use the Next.js `<Image>` component for any static image with known dimensions; pass explicit `width`, `height`, and `alt`.
- Remote image hosts must be added to `next.config.ts` `images.remotePatterns`. Adding a new host requires editing that file.

## Code splitting

- Use `next/dynamic` for heavy or rarely-shown components (PDF viewer, rich-text editor, etc.).

```typescript
const HeavyComponent = dynamic(() => import('@/components/heavy-component'), {
  loading: () => <Skeleton />,
})
```

## Budget

Target Lighthouse 90+ across Performance, Accessibility, Best Practices, and SEO when measured by the team. The agent cannot run Lighthouse — flag any change that obviously regresses LCP, bundle size, or CLS so a human can verify.
