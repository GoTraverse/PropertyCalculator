Read `ERRORS.json` in the project root and check for production client-side errors.

For each error in the list:
1. Report the error message, source file, line number, and when it occurred
2. Trace the error to the relevant source code and determine if it's actionable
3. If fixable, fix the code and remove that error from `ERRORS.json`
4. If not fixable (e.g. third-party script, browser extension noise), note why and remove it from `ERRORS.json`

After processing all errors, commit the updated `ERRORS.json` alongside any fixes.

If `ERRORS.json` has no errors (count is 0), just say "No production errors to fix."
