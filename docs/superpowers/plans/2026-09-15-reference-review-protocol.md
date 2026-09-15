# Reference-based review reliability

The user approved all four changes and a small live retest after implementation.

1. Generate narrative/source reference tables in code. Require the critic to return IDs; hydrate exact text and bind narrative position and speaker locally. Keep strict legacy parsing for saved reports.
2. Adapt only explicitly rejected JSON Schema transport keywords, cache the supported variant, and retain the removed constraints in local validation.
3. Use one bounded correction for explicitly identified bad report items. Merge into the original report, then rerun all validation. Unparseable or unlocatable failures retain the full-report correction.
4. Remove repeated quote, source ID, field and coverage metadata from the new report format. Preserve semantic review and final approval gates.

Implementation ownership: assertion-references/fact-assertion/continuity worker; structured/schema transport worker; pure report repair worker; root owns schemas, prompts, review integration and orchestrator integration.

Verification: targeted failing regressions first, integrated regression suite, lint and production build; independent review; then a small live sample covering the prior quote/JSON failure and invalid audience correction. Record format success separately from factual-review quality. Commit, push and deploy after verification under the user's standing authorization.

Implemented review refinements: preserve exact raw spans alongside the renderer's normalized line text; aggregate invalid citations and action-reference errors; reuse an observed unsupported-keyword hint across schemas on the same endpoint/model. Partial repair requires a complete wire shape and independently checkable targets. Unknown unit ownership, malformed report containers, or dependent continuity that cannot yet be validated use the existing single full correction. The candidate text and game state remain outside the patch surface.
