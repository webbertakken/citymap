# Security policy

## Supported versions

citymap has no releases yet. Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately, never in a public issue, in either of these ways:

- [report a vulnerability](https://github.com/webbertakken/citymap/security/advisories/new) on GitHub, which opens a
  private advisory;
- email [webber@takken.io](mailto:webber@takken.io).

Include what you can:

- what the issue is and what an attacker could do with it;
- the steps, repository or file needed to reproduce it;
- the commit or version you tested.

## What to expect

- An acknowledgement within 7 days.
- An assessment and, if confirmed, a plan for a fix within 30 days.
- Credit in the fix, if you would like it, once it is released.

Please give us a reasonable time to fix the issue before disclosing it publicly.

## Scope

In scope:

- the `citymap` CLI, which reads git repositories and writes city files;
- the viewer, including how it reads city files;
- the packages in this repository.

Out of scope:

- vulnerabilities in third-party dependencies, which belong with their maintainers (Dependabot keeps them current);
- findings that need an already compromised machine.
