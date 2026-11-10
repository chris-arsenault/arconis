import type { Draft } from "./draft";
import type { Statement } from "./syntax";
import { LanguageError } from "./lexer";
import { isCalibration } from "../document/units";
import { LANGUAGE_VERSION } from "./printer";

export function checkVersion(version: number, line: number) {
  if (version > LANGUAGE_VERSION)
    throw new LanguageError(
      `This uses language version ${version}; this canvas reads up to ${LANGUAGE_VERSION}.`,
      line
    );
}

export function calibrateDraft(draft: Draft, statement: Extract<Statement, { kind: "scale" }>) {
  if (statement.calibration && !isCalibration(statement.calibration))
    throw new LanguageError(
      "Scale needs positive finite distances and a unit of at most 32 characters.",
      statement.line
    );
  draft.calibrationChange = { kind: "set", value: statement.calibration };
}
