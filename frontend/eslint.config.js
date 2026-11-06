import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";
import perf from "eslint-plugin-react-perf";
import a11y from "eslint-plugin-jsx-a11y";
import sonar from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";
import * as ahara from "@ahara/standards/eslint-rules";

const rules = Object.fromEntries(
  Object.entries(ahara).map(([name, rule]) => [
    name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
    rule,
  ])
);
export default ts.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "public/**", "test-results/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      react,
      "react-hooks": hooks,
      "react-refresh": refresh,
      "react-perf": perf,
      "jsx-a11y": a11y,
      sonarjs: sonar,
      ahara: { rules },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      // The spatial editor owns keyboard interaction within its application region.
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel", "application"] }],
      ...sonar.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": "warn",
      "react-perf/jsx-no-new-object-as-prop": "warn",
      "react-perf/jsx-no-new-array-as-prop": "warn",
      complexity: ["error", 10],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 75, skipBlankLines: true, skipComments: true }],
      "max-depth": ["warn", 4],
      "ahara/max-jsx-props": "warn",
      "ahara/no-inline-styles": "error",
      "ahara/no-direct-fetch": "error",
      "ahara/no-direct-store-import": "warn",
      "ahara/no-escape-hatches": "error",
      "ahara/no-manual-async-state": "warn",
      "ahara/no-manual-view-header": "warn",
      "ahara/no-manual-expand-state": "warn",
      "ahara/no-raw-undefined-union": "warn",
      "ahara/no-non-vitest-testing": "error",
      "ahara/no-js-file-extension": "error",
    },
  },
  prettier
);
