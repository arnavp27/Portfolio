# Free static deployment

The production build is an Astro static site at [arnavpatil.pages.dev](https://arnavpatil.pages.dev/). Cloudflare Pages serves `dist/` directly, uploaded by GitHub Actions after verification. `wrangler.jsonc` specifies the Pages project and output directory; there are no Pages Functions, server-side rendering, bindings or paid services. A purchased domain is not required.

## Configure once

Create a **Direct Upload** Pages project named `arnavpatil` in the personal Cloudflare account, with `main` as its production branch. GitHub Actions handles the build and upload; do not configure a second Cloudflare Git integration build. The CLI equivalent for initial creation is:

```sh
npx wrangler pages project create arnavpatil --production-branch main
```

In the personal `arnavp27/Portfolio` GitHub repository, set these Actions variables:

- `PUBLIC_SITE_URL`: `https://arnavpatil.pages.dev`.
- `CLOUDFLARE_ACCOUNT_ID`: the personal Cloudflare account ID.
- `CLOUDFLARE_DEPLOY_ENABLED`: `true` once the Pages project, deployment secret and live URL are configured.

Store `CLOUDFLARE_API_TOKEN` in Actions **secrets**, never in source or a public variable. Scope it to the personal Cloudflare account with **Account → Cloudflare Pages → Edit**. The repository does not need visitors' credentials or any runtime API key.

For local builds, export `PUBLIC_SITE_URL` in the shell before building and publishing. Unconfigured builds remain usable locally but omit public canonical URLs and disallow indexing. The publish command checks that this origin matches the built site. This configuration is public, not a credential:

```sh
export PUBLIC_SITE_URL=https://arnavpatil.pages.dev
npm run verify
npm run test:browser
```

Use the standard Ubuntu GitHub runner with this public repository. No larger runners, paid Cloudflare plan or separate asset storage are needed. Keep optional paid usage disabled.

## Publish

Push to `main` using the personal GitHub SSH remote. The workflow installs locked dependencies, checks formatting and types, runs contracts, builds once, then runs the browser suite against `dist/`. Only after all checks pass does it upload that same directory to Pages with `--branch main`. Pull requests only verify. Production publications are serialized to avoid overlapping releases.

To republish, manually run **Verify and publish** on `main`. Manual runs on other branches are skipped. There is one publishing destination: `https://arnavpatil.pages.dev/`.

For a local release after an authenticated Wrangler session and the verification commands above:

```sh
npm run deploy
```

This command validates and uploads the existing tested `dist/`; it does not rebuild. It always targets the `arnavpatil` Pages project's `main` production branch. Pinning Wrangler in the lockfile keeps local and CI behavior aligned. `npm run preview` only serves the build on localhost for development and browser tests; it never publishes a website.

## Caching and routes

Content-hashed `/_astro/` assets receive a one-year immutable browser cache. HTML and stable `/assets/` URLs retain Cloudflare's ETag revalidation defaults, so replacements are detected without redownloading unchanged content. Do not make stable asset filenames immutable unless their URLs are versioned as well.

The generated `night-sky.rgba16f.bin` has one exact-path exception in `public/_headers`: it remains revalidated, but is served as `application/octet-stream` with `no-transform` and no `Content-Encoding`. Its gzip bytes are application data decoded by the sky loader. [Cloudflare's header-removal syntax](https://developers.cloudflare.com/pages/configuration/headers/#detach-a-header) and [compression behavior](https://developers.cloudflare.com/speed/optimization/content/compression/#content-compression-from-origin-servers-to-the-cloudflare-network) explain this rule. After publishing, verify that this asset has those headers and retains the gzip signature `1f 8b`; local preview cannot establish production CDN behavior.

`/camera-workshop/` redirects to `/`. Existing reading pages keep their own URLs. The top-level `404.html` makes missing routes return the custom 404 page with HTTP 404 rather than an application fallback. Local `scripts/serve.mjs` is a development preview, not the production server; validate Cloudflare redirects, MIME types, caching and range responses on the public URL.

## Before sharing

Check the HTTPS version's entry, Read projects link, résumé, both computers, Escape/resume, audio, settings and tab-away/back behavior. Test portrait and landscape touch layouts on real Android and iOS devices, plus an integrated-GPU laptop and a high-density display. Browser emulation catches layout issues but does not measure those devices' GPUs or their native permissions.

Keep the authored 60% render scale and effects during baseline comparisons. Record network loading and frame times separately. Do not add automatic downscaling based on an unrepresentative automated browser run.

## Rollback

In the Pages project's **Deployments** list, find a previously successful production deployment and choose **Rollback to this deployment** from its actions menu. Then revert the problematic Git commit and push the revert so GitHub and production agree. Avoid unrelated pushes until the fix is ready, because successful `main` pushes publish automatically.

## Cloudflare references

- [Direct Upload with continuous integration](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
