---
name: expo-notifications test mocking
description: Prevent random full-suite mobile test failures from real expo-notifications loading
---

Rule: modules with import-time side effects that some suites mock inline and others load transitively need a package-level manual mock (root `__mocks__/` adjacent to node_modules) so resolution is deterministic across parallel workers.

**Why:** expo-notifications is actually installed (old test comments claiming otherwise are wrong). Under parallel full-suite runs, libraries intermittently captured the real module instead of a suite's inline jest.mock, failing random notification suites ("Expected >=1 calls, Received 0") while every suite passed in isolation.

**How to apply:** keep the manual mock; inline jest.mock factories still take precedence. Extend the manual mock when lib code starts using a new API of the mocked module.
