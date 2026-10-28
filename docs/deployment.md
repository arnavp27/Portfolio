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

Store `CLOUDFLARE_API_TOKEN` in Actions **secrets**, never in source or a public variable. Scope it to the personal Cloudflare account with **Account → Cloudflare Pages → Edit**. Workers Scripts permission alone does not authorize Pages deployments. The repository does not need visitors' credentials or any runtime API key.

For local builds, export `PUBLIC_SITE_URL` in the shell before building and publishing. Unconfigured builds remain usable locally but omit public canonical URLs and disallow indexing. The publish command checks that this origin matches the built site. This configuration is public, not a credential:

```sh
export PUBLIC_SITE_URL=https://arnavpatil.pages.dev
npm run verify
npm run test:browser
```

Use the standard Ubuntu GitHub runner with this public repository. No larger runners, paid Cloudflare plan or separate asset storage are needed. Keep optional paid usage disabled.

## Publish

Push to `main` using the personal GitHub SSH remote. The workflow installs locked dependencies, checks formatting and types, runs contracts, builds once, then runs the browser suite against `dist/`. Only after all checks pass does it upload that same directory to Pages with `--branch main`. Pull requests only verify. Production publications are serialized to avoid overlapping releases.

For a preview, manually run **Verify and publish**, select the branch and choose **preview**. It publishes to the non-production `preview` branch, giving a unique deployment URL and updating `preview.arnavpatil.pages.dev`. The fixed preview branch keeps a manual preview of `main` from changing production. Preview publications share a concurrency group so they cannot overlap. Select only trusted branches: a manual preview executes that branch's deployment code with the account's publishing token. Pull requests do not receive this token. A manual **production** run is restricted to `main`.

Local commands, after an authenticated Wrangler session and a build using the public origin:

```sh
npm run check:deploy
npm run deploy:preview
```

`npm run deploy` updates the live site. Neither publish command rebuilds: they validate and upload the existing tested `dist/`. Pinning Wrangler in the lockfile keeps local and CI behavior aligned.

## Caching and routes

Content-hashed `/_astro/` assets receive a one-year immutable browser cache. HTML and stable `/assets/` URLs retain Cloudflare's ETag revalidation defaults, so replacements are detected without redownloading unchanged content. Do not make stable asset filenames immutable unless their URLs are versioned as well.

`/camera-workshop/` redirects to `/`. Existing reading pages keep their own URLs. The top-level `404.html` makes missing routes return the custom 404 page with HTTP 404 rather than an application fallback. Local `scripts/serve.mjs` is a development preview, not the production server; validate Cloudflare redirects, MIME types, caching and range responses on the public URL.

## Before sharing

Check the HTTPS version's entry, Read projects link, résumé, both computers, Escape/resume, audio, settings and tab-away/back behavior. Test portrait and landscape touch layouts on real Android and iOS devices, plus an integrated-GPU laptop and a high-density display. Browser emulation catches layout issues but does not measure those devices' GPUs or their native permissions.

Keep the authored 60% render scale and effects during baseline comparisons. Record network loading and frame times separately. Do not add automatic downscaling based on an unrepresentative automated browser run.

## Rollback

In the Pages project's **Deployments** list, find a previously successful production deployment and choose **Rollback to this deployment** from its actions menu. Preview deployments cannot be used as rollback targets. Then revert the problematic Git commit and push the revert so GitHub and production agree. Avoid unrelated pushes until the fix is ready, because successful `main` pushes publish automatically.

The earlier `arnav-garage` Worker remains available as a separate backup at `https://arnav-garage.thearnavpatil27.workers.dev/`. The Pages workflow does not update or delete it; it retains the last build published there. Current canonical URLs and shared links use the Pages address.

## Cloudflare references

- [Direct Upload with continuous integration](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
