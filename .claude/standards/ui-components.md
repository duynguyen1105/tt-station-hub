# UI Components & Icons

## Component Library Preference

**ALWAYS check shadcn/ui first before creating custom UI components**

When you need a new UI component (button, dialog, dropdown, etc.):

1. **First**: Check if shadcn/ui has the component
   - Visit [shadcn/ui components](https://ui.shadcn.com/docs/components)
   - Use `npx shadcn@latest add [component-name]` to install
2. **Second**: Only create custom components if shadcn/ui doesn't have it
3. **Never**: Install separate component libraries if shadcn/ui can do it

```bash
# ✅ Good - Use shadcn/ui
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu

# ❌ Avoid - Installing other UI libraries
pnpm add @mui/material
pnpm add react-bootstrap
```

## Icon Library Preference

**ALWAYS use Lucide React for icons**

- Project already has `lucide-react` installed
- Lucide provides a comprehensive icon set
- Icons are tree-shakeable and optimized
- Never install additional icon libraries

```typescript
// ✅ Good - Use Lucide React
import { Home, Settings, User, ChevronDown } from 'lucide-react'

function Navigation() {
  return (
    <nav>
      <Home className="h-5 w-5" />
      <Settings className="h-5 w-5" />
      <User className="h-5 w-5" />
    </nav>
  )
}

// ❌ Avoid - Installing other icon libraries
import { FaHome } from 'react-icons/fa'
import HomeIcon from '@mui/icons-material/Home'
```

## When to Create Custom Components

Only create custom components when:

1. **shadcn/ui doesn't have it** - The component doesn't exist in shadcn/ui
2. **Business-specific logic** - Component has complex business logic
3. **Composition of existing components** - Combining multiple shadcn components into a domain-specific component

```typescript
// ✅ Good - Composing shadcn components for business logic
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

function PropertyDetailsModal({ property }: Props) {
  // Custom business logic using shadcn components
  return (
    <Dialog>
      <DialogContent>
        <h2>{property.address}</h2>
        <Button>Contact Agent</Button>
      </DialogContent>
    </Dialog>
  )
}
```

## Checklist for New UI Components

Before creating a new UI component, ask:

- [ ] Does shadcn/ui have this component? → Use shadcn
- [ ] Do I need icons? → Use Lucide React
- [ ] Is this a composition of existing components? → Compose shadcn components
- [ ] Is this truly custom business logic? → OK to create custom
