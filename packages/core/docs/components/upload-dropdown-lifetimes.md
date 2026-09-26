# Upload and dropdown lifetime contracts

File uploads receive an optional third `AbortSignal` argument after the existing
file and progress callback. Use that signal for interruptible work such as fetch.
Removing a file, clearing the feature, or destroying its store aborts that file's
upload and suppresses late progress/results. Work that ignores AbortSignal may
continue externally; it cannot update the retired store. Ordinary component
unmount destroys its internal store. File IDs identify lifetimes and must not be
reused for replacement files.

`onFilesChange` receives independent arrays and copies of file metadata. Mutating
a callback snapshot does not mutate reducer state. Snapshots are not frozen;
applications should treat them as observations. The native File is shared and
immutable. A preview URL belongs to the file's current lifetime and becomes invalid
when the file is removed or the owner is destroyed; retaining a snapshot does not
extend resource ownership. `showPreviews={false}` skips optional image preview
acquisition for new files. Validation checks each file before allocating count
slots, so an invalid file does not consume another valid file's slot.

## Dropdown trigger migration

The dropdown now renders one native button with framework-owned keyboard, ARIA,
focus, and motion behavior. Children are its label content: text, icons, or other
noninteractive markup. Replace the previous documented nested Button usage:

```svelte
<DropdownMenu {items} triggerClass="bg-secondary text-secondary-foreground">
  Actions
</DropdownMenu>
```

Do not place a button or link inside that label. `triggerClass` customizes the
owned button; `class` still styles the menu. This is a markup migration for
applications that followed the earlier nested-button example. The library and
styleguide examples use the supported label form; no consumer listeners, focus
callbacks, or element refs are needed.

Opening moves focus into the menu without scrolling the page. Active commands
scroll into view. Escape, selection, and blank-background dismissal restore the
trigger; focusable outside targets keep their acquired focus. Tab follows normal
navigation. Each entry/exit playback has a component-owned abort signal, which
stops and settles it on replacement/unmount; late completions are ignored and
reducer presentation events are status-guarded. Reduced motion writes the stable
endpoint immediately. This bounded owner contract does not implement the planned
generic managed-motion recipes, ownership hierarchy, or deadlines.
