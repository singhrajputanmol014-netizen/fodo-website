# v33: Brain voice fixes, clean voice screen, natural copy, fair Lab pricing, audit

## FODO Brain voice
- **Laptop "mic connected but not listening":** a second tap while the mic permission prompt was open opened the
  microphone twice, so Gemini got garbled double-speed audio. `FodoVoice.start()` now runs once at a time.
- **Phone needed 2–3 taps:** the mic used to give up when the audio context wasn't "running" yet, which phones report
  for a moment. Now the mic opens and the context is resumed on its own. The first live connection is retried once
  automatically. A phone that needed the plain session goes straight to it next time (re-checked once a day).
- **Mute ≠ end:** the mic button (on the voice screen and in the top bar) now only mutes. The live session stays open and
  sends `audioStreamEnd`; unmute and keep talking. **End** closes the conversation. The 🔇 button that muted *and*
  closed is gone.
- **Old animation coming back:** re-opening voice mode re-mounted the orb on a canvas whose WebGL context was destroyed,
  so it fell back to the old 2-D animation. Each mount now gets a fresh canvas. Orbs are rebuilt if a phone drops WebGL
  in the background.
- **Clean voice screen:** orb, the conversation (live text grows in a bubble), and three controls: *Only when I say
  "FODO"* switch, mic mute, End. Diagnostics and the voice picker are gone from this screen (the voice is chosen in
  Settings). Errors show as one short line.

## Natural copy (no "—")
About 4,150 em-dashes across the website, admin, Brain and builder were replaced with a comma, a colon or "|" in page
titles, depending on context. AI replies (Brain, website chatbot, X-Ray, builder copy) pass through `dedash()` in
`functions/_lib/brain/models.js`. The "—" placeholder for an empty value in tables stays.

## Pricing
- The menu showed "Lab plans" next to "Pricing". They are now **Tool plans & prices** (self-serve Growth Lab) and
  **Agency pricing** (hiring FODO's team). Both pages say which is which and link to the other.
- Single Pro-tool runs were ₹699–₹3,999 for one slice of an X-Ray, while Starter is ₹499 for 10 full X-Rays. They are
  now priced by level (`LEVELS` in `functions/_lib/products.js`):
  - **Quick check ₹99:** Website Health, Offer Strength
  - **Focused audit ₹199:** Revenue Leak, Conversion X-Ray, Why Winning, Market Position, Search, Local, Brand Presence
  - **Deep analysis ₹299:** War Room, AI Visibility, 30-Day Blueprint
  - **Strategy ₹399:** 90-Day Roadmap
- These are the defaults. If prices were changed in **Admin → Config**, those saved values still win.

## Audit fixes
- Public site: 102 pages × desktop and phone, with 0 page errors, 0 sideways scroll, 0 broken internal links and 0 images without alt.
- Admin funnel no longer shows impossible "300%" steps.
- The X-Ray shows "1 page read", not "1 pages read".
- The admin funnel label for checkout no longer names a payment gateway.
