# TypeScript Conventions

## Function Declarations

- **Use `function` keyword instead of arrow functions** for named function declarations
- Arrow functions are acceptable for callbacks, inline functions, and when lexical `this` binding is needed

```typescript
// ✅ Good - Use function keyword
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// ❌ Avoid - Arrow function for named declarations
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// ✅ OK - Arrow functions for callbacks
items.map(item => item.price)
```

## Type Definitions

- **Prefer `type` over `interface`** for type definitions
- Use `interface` only when you need declaration merging or extending classes

```typescript
// ✅ Good - Use type
type User = {
  id: string
  name: string
  email: string
}

type UserWithRole = User & {
  role: string
}

// ❌ Avoid - Interface (unless needed for specific use case)
interface User {
  id: string
  name: string
  email: string
}
```
