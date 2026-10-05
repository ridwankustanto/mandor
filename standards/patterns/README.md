# Patterns

Components keep a product consistent. Patterns keep it coherent. A design system that
only has buttons lets three agents given the same prompt build three different pages.

One file per pattern, written once a screen using it is approved in `/pm-design`:
`list-detail.md`, `settings-page.md`, `onboarding.md`, `empty-first-run.md`.

Each pattern file has:

- **When:** the job it does, and when to use a different one
- **Shape:** regions and their order, with the prototype that shows it
  (`design-prototypes/SCR003-inbox.html`)
- **Flow:** how a user enters, moves through and leaves it, including the error path
- **States:** empty, loading, error, partial, success, and what each one says
- **Components:** which ones, by the names in `design-system.md`

Before building a screen, check here. If a pattern fits, use it. If none does, the new
screen becomes the next pattern after it is approved.
