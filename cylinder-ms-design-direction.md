# Cylinder MS — Frontend Design Direction

**Audience:** Patel & Company operators, Nagpur  
**Platform:** Web (responsive: mobile 375px → desktop 1920px)  
**Purpose:** Industrial gas cylinder distribution management — clarity, speed, trustworthiness  
**Aesthetic:** Modern Industrial (warm neutrals + sharp data visualization)

---

## Design Vision

**Tone:** Trustworthy but not stuffy. Industrial but approachable. Built for operators who work at speed.

Think: Tesla factory UI meets Indian logistics dashboard. Clean, purposeful, data-driven, with warmth.

**One Memorable Thing:** Live cylinder status map + rotation counter that updates in real-time. Operators see cylinders moving through the system at a glance.

---

## Color Palette

### Primary: Warm Steel
- **Steel Blue:** `#1e3a5f` (backgrounds, headers, trust)
- **Warm Accent:** `#d97706` (safety orange for alerts, actions)
- **Success Green:** `#10b981` (delivered, returned, completed)

### Secondary: Industrial Grays
- **Light Neutral:** `#f3f4f6` (backgrounds, cards)
- **Dark Neutral:** `#374151` (text, borders)
- **Muted:** `#9ca3af` (secondary text, disabled)

### Supporting
- **Alert Red:** `#ef4444` (overdue, errors)
- **Warning Amber:** `#f59e0b` (caution)
- **Info Blue:** `#3b82f6` (information)

**CSS Variables:**
```css
--color-steel: #1e3a5f;
--color-accent: #d97706;
--color-success: #10b981;
--color-neutral-light: #f3f4f6;
--color-neutral-dark: #374151;
--color-alert: #ef4444;
```

---

## Typography

### Display Font: **Sora** (Google Fonts)
- Used for: Page titles, dashboard headers, bill numbers
- Weight: 600–700 (bold, confident)
- Size: 28–48px
- Character: Modern geometric sans, warm feel

### Body Font: **Inter** (Google Fonts)
- Used for: All body text, tables, forms
- Weight: 400–600
- Size: 14–16px (mobile-friendly minimum)
- Spacing: 1.5–1.6 line height for readability

### Monospace: **IBM Plex Mono** (numbers, refs)
- Used for: Bill numbers, ECR refs, cylinder IDs
- Size: 12–14px
- Purpose: Industrial, data-precise feel

**Implementation:**
```html
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">

<style>
  h1, h2, .title { font-family: 'Sora', sans-serif; font-weight: 700; }
  body, p, span { font-family: 'Inter', sans-serif; font-weight: 400; }
  .code, .ref { font-family: 'IBM Plex Mono', monospace; }
</style>
```

---

## Layout System

### Responsive Breakpoints
```css
--bp-mobile: 375px   /* iPhone SE */
--bp-tablet: 768px   /* iPad */
--bp-desktop: 1024px /* Desktop */
--bp-wide: 1920px    /* 4K monitors */
```

### Spacing (8px grid)
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
```

### Mobile-First Structure
```
Mobile (375px):
  - Single column
  - Full-width cards
  - Stacked navigation
  - Touch-friendly buttons (48px min)

Tablet (768px):
  - 2-column grid
  - Sidebar navigation (optional)
  - Compact forms

Desktop (1024px+):
  - 3-column layout + sidebar
  - Data tables visible
  - Dashboard cards in grid
  - Modals instead of full-page forms
```

---

## Component Library

### Cards
```css
.card {
  background: var(--color-neutral-light);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: var(--space-lg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}

/* On mobile: full-width, no margin */
@media (max-width: 768px) {
  .card {
    margin: 0;
    border-radius: 8px;
  }
}
```

### Buttons
```css
.btn-primary {
  background: var(--color-accent);
  color: white;
  padding: var(--space-sm) var(--space-lg);
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  min-height: 44px; /* Mobile touch */
}

.btn-primary:hover {
  background: #b85d00;
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: var(--color-neutral-light);
  color: var(--color-steel);
  border: 2px solid var(--color-neutral-dark);
}
```

### Forms (Mobile-Optimized)
```css
.form-group {
  margin-bottom: var(--space-lg);
}

.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-sm);
  font-size: 14px;
}

.form-input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 16px; /* Prevents iOS zoom */
  font-family: 'Inter', sans-serif;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.1);
}

/* On mobile: full-width, larger touch area */
@media (max-width: 768px) {
  .form-input {
    min-height: 44px;
  }
}
```

### Data Tables (Responsive)
```css
.table-responsive {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th {
  background: var(--color-steel);
  color: white;
  padding: var(--space-md);
  text-align: left;
  font-weight: 600;
}

td {
  padding: var(--space-md);
  border-bottom: 1px solid #e5e7eb;
}

tr:hover {
  background: var(--color-neutral-light);
}

/* On mobile: horizontal scroll */
@media (max-width: 768px) {
  table {
    font-size: 12px;
  }
  
  th, td {
    padding: var(--space-sm);
  }
}
```

### Status Badges
```css
.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-success {
  background: #d1fae5;
  color: #065f46;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.badge-alert {
  background: #fee2e2;
  color: #7f1d1d;
}

.badge-info {
  background: #dbeafe;
  color: #1e3a8a;
}
```

---

## Navigation Patterns

### Mobile (< 768px)
```
Header
├─ Logo (left)
├─ Menu hamburger (right)
└─ Bottom tab bar (persistent)
   ├─ Transactions
   ├─ ECR
   ├─ Dashboard
   ├─ Reports
   └─ Settings
```

### Desktop (≥ 768px)
```
Sidebar (collapsible, 240px)
├─ Logo
├─ User profile
├─ Nav items (vertical)
└─ Logout

Main content area (full width)
├─ Header with title + actions
└─ Content
```

**Code:**
```jsx
// Mobile tab bar
const MobileNav = () => (
  <nav className="mobile-nav">
    <Link to="/transactions" icon={<FileText />}>Bills</Link>
    <Link to="/ecr" icon={<RotateCcw />}>ECR</Link>
    <Link to="/dashboard" icon={<BarChart3 />}>Dashboard</Link>
    <Link to="/reports" icon={<PieChart />}>Reports</Link>
    <Link to="/settings" icon={<Settings />}>Settings</Link>
  </nav>
);

// Sidebar nav
const SidebarNav = () => (
  <aside className="sidebar">
    <Logo />
    <nav className="sidebar-nav">
      {navItems.map(item => <NavItem key={item.id} {...item} />)}
    </nav>
  </aside>
);
```

---

## Key Pages: Mobile-First Design

### 1. Dashboard (Entry Point)
```
[Mobile]
- Header: "Dashboard" + date
- KPI cards (stacked, full-width)
  ├─ Cylinders out today
  ├─ Returned today
  ├─ Pending ECR
  └─ Overdue (red highlight)
- Live rotation chart (small)
- Recent bills list (scrollable)
- Action button: "New Bill"

[Desktop]
- Grid: 4 KPI cards across top
- Left: Live rotation chart (large)
- Right: Recent bills + alerts
- Bottom: Dashboard metrics
```

### 2. Transactions (Bill Creation)
```
[Mobile]
- Customer selector (dropdown)
- Cylinder count + selector
- Quantity input
- Date picker
- Submit button (full-width, sticky)

[Desktop]
- Multi-column form
- Cylinder table (inline add/remove)
- Real-time validation
- Side panel: Bill preview
```

### 3. ECR (Returns)
```
[Mobile]
- Scan cylinder number (or type)
- Auto-fetch: last issue date, hold days, rent
- Return date (default: today)
- Challan # (optional)
- Confirm button (green, prominent)

[Desktop]
- Left: Holding list (searchable)
- Right: Return form + rent preview
- Auto-calc rent as you scroll
```

### 4. Reports
```
[Mobile]
- Report type selector
- Date range picker
- Generate button
- Results (scrollable table or export link)

[Desktop]
- Sidebar filters
- Main area: Interactive charts + table
- Export options (PDF, CSV)
```

---

## Animations & Micro-Interactions

### Page Load (Staggered reveal)
```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card {
  animation: slideUp 0.4s ease-out forwards;
}

.card:nth-child(1) { animation-delay: 0s; }
.card:nth-child(2) { animation-delay: 0.1s; }
.card:nth-child(3) { animation-delay: 0.2s; }
```

### Form Validation
```css
/* Green checkmark on valid field */
.form-input.valid {
  border-color: var(--color-success);
  background-image: url('data:image/svg+xml,...');
  background-repeat: no-repeat;
  background-position: right 8px center;
}

/* Red border + error message on invalid */
.form-input.invalid {
  border-color: var(--color-alert);
}

.form-error {
  color: var(--color-alert);
  font-size: 12px;
  margin-top: 4px;
  animation: slideDown 0.2s ease-out;
}
```

### Button Feedback
```css
.btn:active {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading spinner inside button */
.btn.loading::after {
  content: '';
  display: inline-block;
  margin-left: 8px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  animation: spin 0.8s linear infinite;
}
```

### Modal/Overlay
```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  animation: fadeIn 0.2s ease-out;
}

.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.95);
  animation: popIn 0.3s ease-out forwards;
}

@keyframes popIn {
  to {
    transform: translate(-50%, -50%) scale(1);
  }
}

/* On mobile: full-screen modal */
@media (max-width: 768px) {
  .modal {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    transform: translateY(100%);
    border-radius: 12px 12px 0 0;
  }
  
  .modal.open {
    animation: slideUp 0.3s ease-out forwards;
  }
}
```

---

## Dark Mode Support (Optional)

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-neutral-light: #1f2937;
    --color-neutral-dark: #e5e7eb;
  }
  
  .card {
    background: #111827;
    border-color: #374151;
  }
  
  table {
    color: #e5e7eb;
  }
  
  th {
    background: #0f172a;
  }
}
```

---

## Accessibility (A11y)

### Keyboard Navigation
```css
/* Visible focus indicator */
*:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
}

/* Skip to main content link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-accent);
  color: white;
  padding: 8px 16px;
  text-decoration: none;
}

.skip-link:focus {
  top: 0;
}
```

### Semantic HTML
```jsx
<header role="banner">
  <nav role="navigation" aria-label="Main">
    ...
  </nav>
</header>

<main role="main">
  <article role="article">
    <h1>Dashboard</h1>
    ...
  </article>
</main>

<footer role="contentinfo">
  ...
</footer>
```

### Labels & ARIA
```jsx
<div className="form-group">
  <label htmlFor="cylinder-number">Cylinder Number</label>
  <input
    id="cylinder-number"
    type="text"
    aria-required="true"
    aria-describedby="cylinder-help"
  />
  <small id="cylinder-help">Format: AA001 or similar</small>
</div>
```

---

## Performance Considerations

### Mobile-First CSS
- Load minimal CSS on mobile (no desktop-only styles)
- Use `@media (min-width: ...)` for progressive enhancement

### Images & Icons
- Use SVG for icons (scalable, lightweight)
- Use WebP with PNG fallback for images
- Lazy-load images below the fold

### Code Splitting (React)
```jsx
// Load dashboard chart only on dashboard page
const RotationChart = React.lazy(() => import('./RotationChart'));

const Dashboard = () => (
  <Suspense fallback={<Loading />}>
    <RotationChart />
  </Suspense>
);
```

---

## Implementation Checklist

- [ ] Set up CSS variables in `index.css`
- [ ] Import Google Fonts (Sora, Inter, IBM Plex Mono)
- [ ] Create base styles (reset, typography, spacing)
- [ ] Build component library (Button, Card, Form, Table, Badge)
- [ ] Implement responsive grid system
- [ ] Add mobile navigation (tab bar)
- [ ] Add animations (page load, form validation, modals)
- [ ] Test on mobile (375px), tablet (768px), desktop (1024px+)
- [ ] Test dark mode (if enabled)
- [ ] Test keyboard navigation (Tab, Enter, Escape)
- [ ] Test on real devices (iOS Safari, Android Chrome)
- [ ] Verify lighthouse scores (mobile: 90+, desktop: 95+)

---

## Summary

**Modern, warm, trustworthy.** Operators know where they are, what to do next. Data clear, actions obvious. Works beautifully on 5-inch phone or 30-inch monitor. Responsive, not reactive—same UI scales gracefully.

**One moment of delight:** Live cylinder rotation map. Operators see the system breathing.
