# Working agreement

This is an offline chart library. Keep private collector sources, operational
records and recordings outside the public repository. Examples must be synthetic
or explicitly reviewed for distribution.

- Reuse inspected rendering helpers where sound; record exact private provenance outside this directory.
- Keep rendering separate from collection, book reconstruction and playback ownership.
- Preserve supplied timestamps, decimal strings, direction and instrument identity.
- Unknown trade direction is neutral. Never infer trades from book changes.
- Keep JavaScript modules below 300 lines through meaningful decomposition.
- Prefer focused semantic checks and actual browser verification over coverage targets.
- Run npm test and npm run check. Verify import, layer controls and chart interactions in the browser.
- No live services, credentials, orders, accounts or commercial infrastructure.
