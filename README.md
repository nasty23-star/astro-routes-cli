# astro-routes-cli

List all Astro routes from the CLI without a full build.

[![npm version](https://img.shields.io/npm/v/astro-routes-cli.svg)](https://www.npmjs.com/package/astro-routes-cli)
[![license](https://img.shields.io/npm/l/astro-routes-cli.svg)](https://github.com/yourname/astro-routes-cli/blob/main/LICENSE)

## Why

Astro doesn't have a built-in command to list routes. You can run `astro build`, but it does a full build and takes 30–60 seconds. You can open the dev toolbar, but it only works in the browser during `astro dev`.

This CLI gives you a quick, scriptable way to see every route in your project — pages, endpoints, redirects, and routes injected by integrations — in 2–5 seconds.

## Install

```bash
# Global
pnpm add -g astro-routes-cli

# Or run once without installing
pnpm dlx astro-routes-cli
