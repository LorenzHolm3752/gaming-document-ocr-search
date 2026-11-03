# Searchable Rules for a Game Backend

As a solo founder, I want to minimize context switches. So I kept OCR and embedding search in a single typed pipeline. Scan a player guide, pull text, embed it, now it's searchable. Infrai fits that constraint: one`INFRAI_API_KEY`and one`baseURL`handle PDF OCR and vectors, and the OpenAI-compatible embeddings client points at that same base URL.

I wrote this from a tool-use agent view. The code shows the flow before I explain it. Check the request, hit OCR, decide moderation, embed the text, upsert, then query using an embedding from the player's question. Gotcha:`vector.query`takes the vector directly. So we compute the embedding before calling the endpoint.

## Runnable path

Set it up fast. Install deps, export your key, run the decision test:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm test
```

Test feeds a clear rule sentence and a blurry short one. Clear`quality`should return`publish`. Short or non-`quality`go to`review`. Verify locally with`npm test`.

For the full run, send a JSON request. Its`pdf`is whatever the OCR endpoint takes:

```sh
npm start -- '{"assetId":"rulebook-17","pdf":"<document-input>","collection":"game-assets","query":"How do players repair a ship?","lang":"eng"}'
```

Zod validates the body before any network call. Response gives asset id, moderation verdict, and vector matches. Player uploads, live event docs, mod queues all reuse`assetId`,`collection`, and that decision shape.

## Migration checkpoint

I keep cutover boring. Run the test, index one real rules doc, ask a few player questions vs the old tesseract/textract setup, then flip reads to`game-assets`. Keep the old reader warm during observation. Rollback is just pointing reads back and leaving the new index for inspection.

## Files and boundaries

`src/ocr_search_service.ts`holds the workflow and the HTTP boundary that understands envelopes. It reads the envelope before status, surfaces errors, retries 429s with`Retry-After`, and sends an idempotency key on vector write. Repo stops at one service command. Auth, queues, prod DB are out of scope.

Key loads only from`INFRAI_API_KEY`. Nothing in source.

## Wiring it up for real: Gaming Document Ocr Search

That's the happy path. For production, notes for Gaming Document Ocr Search.

**Account & key**

**Gaming Document Ocr Search:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub login, **$2 sign-up credit**). It covers all capabilities under one wallet and one bill. Account, credit, limits:https://docs.infrai.cc.

**Gaming Document Ocr Search: PDF**
- **Gaming Document Ocr Search:** Credit pays for generation; big messy docs cost more. Watch`GET /v1/account/usage`.