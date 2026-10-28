# Editing content

## Projects

Create `src/content/projects/project-name.md`. Its filename becomes `/work/project-name/`.

```md
---
title: 'Project name'
category: 'Computer vision'
zone: 'projects'
summary: 'What it does, in one or two sentences.'
order: 5
year: '2026'
role: 'What I built'
status: 'Live demo'
tags: ['Python', 'PyTorch']
links:
  - label: 'Try it'
    url: 'https://example.com/'
draft: false
---

## The problem

Write the project story here.
```

Lower `order` values appear first. `zone: projects` adds an entry to the personal computer's Projects folder; `work` identifies employment work and `extracurricular` identifies work such as TerraTrunk. Every published project gets a standalone page and appears in `/work/` and the no-JavaScript homepage. Adding a project does not require changing the camera or geometry.

`status`, `links`, `image`, `imageAlt` and `scene` are optional. The existing `scene` keys connect selected projects to established icons/props (`kazam`, `pixel`, `onco`, `solar`); leave this field out for a new ordinary project. Keep `scene: solar` on the TerraTrunk entry so the photo board finds it.

Put optimized photographs in `public/assets/images/` and use `/assets/images/file.webp`. Add descriptive alternative text. Original photography and private source documents belong outside the repository.

## Writing

Create `src/content/articles/my-article.md`, or edit the supplied draft starter:

```md
---
title: 'What I learned building…'
description: 'A short introduction.'
date: 2026-11-01
draft: true
---

The article body.
```

Set `draft: false` to publish. Published articles appear in the personal computer's Writing folder, the no-JavaScript homepage, `/notes/`, and `/notes/my-article/`. When no articles are published, Writing is absent and `/notes/` redirects home. Newest dates appear first; the date does not schedule publication.

Drafts are omitted from the generated website, but their source remains visible if this repository is public. Do not store confidential notes as drafts here.

## Profile and interaction copy

- Résumé/background: `src/pages/resume.astro`.
- Entry/contact copy: `src/components/Garage.tsx` and `ComputerDesktop.tsx`.
- Navigation/page metadata: `src/layouts/Layout.astro`.
- Verified open-source contribution links: `src/config/contributions.ts`.
- Content metadata rules: `src/content.config.ts`.

Keep the Kazam case study a public account of the work. Internal application screens, logs, credentials and operational source data do not belong in this site.

Run `npm run format`, then `npm run verify`. Content tests use their own temporary copy and already account for existing published writing. Preview the generated pages with `npm run preview` before publishing.
