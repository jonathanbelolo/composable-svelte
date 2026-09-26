# Reporting a capability gap

Use this format when a requirement has no documented supported implementation
in the installed version. A gap report identifies missing work; it does not
count as delivering the requested behavior.

- **Required behavior:** the user-visible result, including interruption or
  cleanup behavior when relevant.
- **Installed versions:** core and any integration packages involved.
- **Supported paths examined:** public APIs and installed guide sections, with
  the specific reason each is insufficient.
- **Missing guarantee:** the capability, ownership boundary or lifecycle
  guarantee needed. Include a minimal reproduction if an existing API fails.
- **Proposed next step:** a supported alternative, the smallest framework
  extension, or an explicitly agreed temporary deviation and its removal plan.
- **Remaining work:** independent supported work that can continue, and checks
  needed to establish that the gap has been resolved.

Do not guess private APIs or present a helper that recreates framework machinery
as a conforming solution. An exception needs a specific scope; a directory name
does not grant one.
