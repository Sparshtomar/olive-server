# 0008 - A second AI provider behind the same port

**Status:** Accepted

## Context

Two days before submission the Google Cloud project behind the Gemini key was
suspended, and a replacement key could not be created without payment. Every AI call
in production - meal photos, voice notes, lab reports, chat - failed. The AI layer had
been written against interfaces (`MealAnalyzer`, `ReportExtractor`, `HealthAssistant`,
ADR 0001) with Gemini as the only real adapter.

## Decision

Add Groq as a second adapter, selected by `AI_PROVIDER=groq`, and keep Gemini. Groq's
free tier needs no card. Where Groq lacks a capability Gemini has, the adapter fills it
on the server rather than leaking the difference to the app:

- **Vision**: `qwen3.8-27b` reads images and returns JSON. The client sends image
  requests only to models known to accept them.
- **Voice**: Groq's text models cannot hear, so Whisper transcribes first and the
  transcript is analysed as text; the transcript is kept on the draft, as Gemini's was.
- **PDFs**: Groq has no PDF input. Digital PDFs are reduced to their text layer on the
  server (`unpdf`); scanned PDFs, which have none, get a clear "photograph the pages"
  error, and the app already supports photographing a report.
- **Structured output**: JSON mode plus the schema in the system prompt, validated with
  Zod, rather than Groq's `json_schema` format, which rejects schemas some models cannot
  follow and fails the whole request. A schema-invalid answer falls through to the next
  model, exactly as the Gemini client does.

Prompts, model-output schemas and the clamp-and-map step moved from `ai/gemini/` to
`ai/` so both adapters share one definition of what a good answer looks like.

## Consequences

- Production is unblocked without touching a route, service or screen.
- The swap took one afternoon, which is the point of the port.
- Voice is two calls instead of one, so it is a little slower on Groq.
- Scanned PDFs work on Gemini and not on Groq. The error says what to do instead.
- Two sets of free-tier limits to keep in mind; both clients fall through a model list.

## Revisit when

A Gemini key is available again - flip `AI_PROVIDER`, nothing else. Or when a third
capability gap appears (video, say) that one provider has and the other does not; the
rule stays the same: fill it in the adapter, never in the app.
