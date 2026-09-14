# Task5 Astra review at d28e072

SPEC: CHANGES_REQUIRED
CODE QUALITY: CHANGES_REQUIRED

Reviewed9e99517..d28e072. Three P1 findings:

1. Valid school opportunity selection loses authoritative destination (turn-preparation.ts:436; action-authority.ts:174). From home day1 exactinvestigation:c1:F002:atmosphere:school label/scope/location, prep still yieldshome/no scenecontract/F001 only; matchingDirectorschoolstepthrowsdestinationmismatch. Revalidate selection early; trustedmetadata drives destination, scenecontract, factcontext andadapter. Verify actualhook home→school55+travelonce, acceptedfact, interrupted/reloadedcontinuation.

2. Empty authoritative menus resurrect stale/Writer rows (useGameLoop.ts:616; scene-parser.ts:254). mergeParsedIntoScene uses.length, recoversprev/acceptedScene onexplicit[]. Distinguish empty authoritativearrays fromabsentlegacydata throughoutforeground/async/persistence/reconstruction. Verify populatedpreviouslists, Writercompletelists+nolegalcandidates, asyncenrichment,reload,freepanel nocharge/nogeneration.

3. Seven-fact catalog excludes legal route investigations (investigation-opportunities.ts:121). Day2homeknowingF001/F007hint yields0opportunities, though realgate haslegalnewnone-letter-bedroom (truth-graph.ts:309). Allotherroutefacts omitted. Supply safe authoredpublicaffordances forlegalroute milestones, candidategenerationthrough existinggates/publicdestinations. Preservehiddenanswers/cycle/evidence/routegates. Verify day2bedroom andrepresentativeA/B/C/NONE/FAKE, exhaustion/upgrades, affordable distinctdefault.

Reviewer performed readonly productionfunctionprobes, nofilewrites/suitereruns/livecalls. Task7opening/UI migration andTask8liveacceptance excluded. Root captured finalreport; fixround1 required beforeTask5gate.
