# Loading and notifications

## Skeletons

Import shared placeholders from `@/components/ui`. `Skeleton` supports
`rectangle` (default), `circle`, and `text` variants. Use Tailwind classes for
dimensions. The placeholders use theme tokens, are hidden from assistive
technology, and stop pulsing when reduced motion is enabled.

Wrap a group in `SkeletonRegion` to announce loading once:

```tsx
<SkeletonRegion label="Loading records" className="space-y-4">
    <Skeleton variant="text" className="w-32" />
    <Skeleton className="h-48 w-full" />
</SkeletonRegion>
```

`StatCardsSkeleton`, `ChartSkeleton`, and `ListSkeleton` compose into feature
layouts. Health Overview, Finance Overview, and Expenses each have a dedicated
skeleton beside their presentation components. Keep the real page header and
application shell mounted while showing these placeholders.

Show a skeleton only before initial data is available. Preserve existing
content during mutations or background refreshes, and show the ordinary empty
state after a successful load with no records. Use `LoadError` with a retry
callback when initialization fails. Do not leave the loading skeleton visible
after a failed request.

Health retains its authenticated Zustand store and MySQL API. Finance retains
its existing browser persistence. Finance initialization errors expose
`loadError` and `retry` through `useFinance`; unreadable saved values are left
intact, and mutations are blocked until initialization succeeds.

## Notifications

One Sonner `Toaster` is mounted in the root layout. Its colours inherit the
LifeOS theme rather than the operating system's theme. Do not mount another
toast container in a page or dialog.

Client action handlers import the central entry point:

```tsx
import { notify } from "@/lib/notifications";

try {
    await saveRecord(values);
    notify.success("Record saved.");
} catch {
    notify.error("Unable to save this record.", {
        description: "Review the form and try again.",
    });
}
```

`notify.warning` and `notify.info` accept the same arguments. Optional options
include `description`, `action`, `id`, and `duration`. Defaults are four seconds
for success, eight for errors, six for warnings, and five for information.
Users can dismiss notifications or focus them with Sonner's Alt+T shortcut.

Notify at the layer that knows which user action completed, after the operation
resolves. API services and stores propagate errors without emitting toasts.
Keep field validation and actionable inline errors. Use friendly toast text;
do not pass raw exceptions, server diagnostics, or credentials to notifications.
Avoid notifications for routine GET requests or successful background refreshes.

Health log and target mutations and Finance account, investment, liability,
transaction, and expense mutations are integrated. Authentication forms keep
their existing inline feedback. The dashboard uses static demonstration data
and has no data mutations to notify about.
