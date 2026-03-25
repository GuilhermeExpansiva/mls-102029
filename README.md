# 102029 · Collab Common Runtime

Part of **collab.codes**.

`102029` is the shared runtime foundation for this opinionated collab.codes model. It contains the browser and runtime primitives that every other project can safely build on without inheriting module-specific business rules.

## Why this project exists

As the workspace grows to support many clients, some pieces must stay stable and reusable:

- shared runtime contracts
- browser-to-BFF communication helpers
- shell/runtime integration points
- generic interaction and loading primitives
- cryptography and id utilities
- base design-system tokens

`102029` is the place for that layer.

## What belongs here

- public runtime contracts shared across projects
- common frontend runtime helpers
- generic browser-side utilities
- shared design/runtime foundations
- cross-project infrastructure that is not tied to one module

## What should not live here

- module-specific contracts
- client-specific business rules
- monitor, audit, petshop, or any other domain logic
- shell implementation details that belong to the master frontend
- backend orchestration that belongs to the master backend

## Key advantages

- **Stable shared base**: new runtimes can depend on one common layer instead of re-implementing the same helpers.
- **Cleaner scaling model**: multiple clients can share runtime foundations without coupling to each other.
- **Safer boundaries**: general contracts live here, while module contracts stay out.
- **Lower duplication**: common utilities such as transport, ids, crypto, and shell-facing types stay centralized.

## Current capabilities

- shared bootstrap contracts
- shared BFF client
- shared shell event contracts
- shared interaction runtime contracts/helpers
- `uuidv7` utilities
- Web Crypto helpers
- design-system base primitives

## Role inside the collab.codes model

This project is the mandatory common runtime for the current four-project setup:

- `102029`: common runtime
- `102033`: master frontend
- `102034`: master backend
- `102030`: client project example

In this model, every runtime can depend on `102029`, but `102029` should remain generic and domain-neutral.

## Support

If you need help, please open a **GitHub Issue** in the repository that contains this project.

When opening an issue, include:

- your environment
- the project code and module involved
- clear reproduction steps
- expected behavior
- actual behavior
- logs, screenshots, or stack traces when available

## Status

This project is intended to be a long-lived shared foundation for collab.codes workspaces. Changes here should favor stability, clarity of boundaries, and reuse across many clients.
