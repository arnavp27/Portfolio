# Free static deployment

The production build is an Astro static site. Cloudflare Workers Static Assets serves `dist/` directly; `wrangler.jsonc` intentionally has no Worker script, server-side rendering, bindings or paid services. Use the included `workers.dev` address on Workers Free. A purchased domain is not required.

## Configure once

In the personal `arnavp27/Portfolio` GitHub repository, set these Actions variables:

- `PUBLIC_SITE_URL`: the complete live HTTPS origin, without a path.
- `CLOUDFLARE_ACCOUNT_ID`: the personal Cloudflare account ID.
- `CLOUDFLARE_DEPLOY_ENABLED`: `true` once the account, deployment secret and live URL are configured. The first successful `main` run creates the Worker; preview versions are available afterward.

Store `CLOUDFLARE_API_TOKEN` in Actions **secrets**, never in source or a public variable. Scope it to the personal Cloudflare account and only the Workers permissions needed to publish static assets. The repository does not need visitors' credentials or any runtime API key.

For local builds, export `PUBLIC_SITE_URL` in the shell before building and publishing. Unconfigured builds remain usable locally but omit public canonical URLs and disallow indexing. The publish command checks that this origin matches the built site. This configuration is public, not a credential:

```sh
export PUBLIC_SITE_URL=https://arnav-garage.thearnavpatil27.workers.dev
npm run verify
npm run test:browser
```

Use the standard Ubuntu GitHub runner with this public repository. No larger runners, paid Cloudflare plan or separate asset storage are needed. Keep optional paid usage disabled.

## Publish

Push to `main` using the personal GitHub SSH remote. The workflow installs locked dependencies, checks formatting and types, runs contracts, builds once, then runs the browser suite against `dist/`. Only after all checks pass does it upload that same directory. Pull requests only verify. Production publications are serialized to avoid overlapping releases.

For a preview, manually run **Verify and publish**, select the branch and choose **preview**. It uploads a version with the `preview` alias without replacing the active deployment. The Worker must have an initial deployment before preview versions can be uploaded. Select only trusted branches: a manual preview executes that branch's deployment code with the account's publishing token. Pull requests do not receive this token. A manual **production** run is restricted to `main`.

Local commands, after an authenticated Wrangler session and a build using the public origin:

```sh
npm run check:deploy
npm run deploy:preview
```

`npm run deploy` updates the live site. Neither command rebuilds: they validate and publish the existing tested `dist/`. Pinning Wrangler in the lockfile keeps local and CI behavior aligned.

## Caching and routes

Content-hashed `/_astro/` assets receive a one-year immutable browser cache. HTML and stable `/assets/` URLs retain Cloudflare's ETag revalidation defaults, so replacements are detected without redownloading unchanged content. Do not make stable asset filenames immutable unless their URLs are versioned as well.

`/camera-workshop/` redirects to `/`. Existing reading pages keep their own URLs. Missing routes return the custom 404 page with HTTP 404. Local `scripts/serve.mjs` is a development preview, not the production server; validate Cloudflare redirects, MIME types, caching and range responses on the public URL.

## Before sharing

Check the HTTPS version's entry, Read projects link, résumé, both computers, Escape/resume, audio, settings and tab-away/back behavior. Test portrait and landscape touch layouts on real Android and iOS devices, plus an integrated-GPU laptop and a high-density display. Browser emulation catches layout issues but does not measure those devices' GPUs or their native permissions.

Keep the authored 60% render scale and effects during baseline comparisons. Record network loading and frame times separately. Do not add automatic downscaling based on an unrepresentative automated browser run.

## Rollback

Cloudflare keeps deployment versions. In the Worker's deployment history, roll back to the last verified version, then revert the problematic Git commit and push the revert so GitHub and production agree. From the CLI, `npx wrangler rollback <version-id>` performs the same rollback. Avoid unrelated pushes until the fix is ready, because successful `main` pushes publish automatically.
