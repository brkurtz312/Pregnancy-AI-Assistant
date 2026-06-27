// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores: build output, generated code, caches, and non-source dirs.
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/generated/**",
      "**/*.tsbuildinfo",
      ".local/**",
      ".agents/**",
      "**/.replit-artifact/**",
      ".cache/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared language options + relaxed rules that would otherwise flood the
  // codebase with pre-existing stylistic noise. The goal is to catch real
  // mistakes (unused vars, common JS bugs) without blocking on every `any`.
  {
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Catch misuse of React hooks; exhaustive-deps stays a warning so the
      // existing intentional eslint-disable directives remain valid.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // TypeScript already reports undefined identifiers; the lint version
      // produces false positives across mixed Node/browser/RN globals.
      "no-undef": "off",
      // React Native / Metro idiomatically uses require() for static assets.
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Server code must not use console.* — use req.log / the singleton logger
  // (see the pnpm-workspace convention).
  {
    files: ["artifacts/api-server/src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },

  // Disable formatting rules that conflict with Prettier.
  prettier,
);
