import { extractText, getDocumentProxy } from 'unpdf';
import { addDays, toDateKey, type MealDraft, type ReportDraft } from '@sparshtomar/olive-shared';
import { unsupportedFile } from '../../lib/errors';
import { toMealDraft, toReportDraft } from '../mappers';
import { MEAL_SYSTEM_PROMPT, REPORT_SYSTEM_PROMPT, mealUserPrompt } from '../prompts';
import { aiMealSchema, aiReportSchema } from '../schemas';
import type { BinaryInput, MealAnalyzer, MealInput, ReportExtractor } from '../types';
import { imagePart, type GroqClient } from './groq-client';

/** Below this much text a PDF is a scan (or empty): the model would have nothing to read. */
const MIN_PDF_TEXT = 40;
/** Keeps a long multi-page report inside the model's context. */
const MAX_PDF_TEXT = 60_000;

export class GroqMealAnalyzer implements MealAnalyzer {
  constructor(private readonly client: GroqClient) {}

  async analyze(input: MealInput): Promise<MealDraft> {
    if (input.kind === 'voice') return this.fromVoice(input);
    const content =
      input.kind === 'text'
        ? mealUserPrompt.text(input.text)
        : [imagePart(input), { type: 'text' as const, text: mealUserPrompt.photo(input.caption) }];
    const ai = await this.client.generateJson({
      system: MEAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      schema: aiMealSchema,
    });
    return toMealDraft(ai);
  }

  /** Groq's text models can't hear, so Whisper transcribes first and the transcript is analysed as text. */
  private async fromVoice(input: Extract<MealInput, { kind: 'voice' }>): Promise<MealDraft> {
    const transcript = await this.client.transcribe(input);
    if (transcript.replace(/[^\p{L}\p{N}]/gu, '').length < 2) {
      return {
        isFood: false,
        title: '',
        items: [],
        message: "I couldn't hear anything in that recording - try again a little closer to the mic.",
      };
    }
    const ai = await this.client.generateJson({
      system: MEAL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: mealUserPrompt.text(transcript) }],
      schema: aiMealSchema,
    });
    return toMealDraft({ ...ai, transcript });
  }
}

export class GroqReportExtractor implements ReportExtractor {
  constructor(private readonly client: GroqClient) {}

  async extract(file: BinaryInput): Promise<ReportDraft> {
    const content =
      file.mimeType === 'application/pdf'
        ? `Extract the lab results from this report. Its text, as printed:\n\n${await pdfText(file.data)}`
        : [imagePart(file), { type: 'text' as const, text: 'Extract the lab results from this report.' }];
    const ai = await this.client.generateJson({
      system: REPORT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      schema: aiReportSchema,
      timeoutMs: 90_000,
    });
    return toReportDraft(ai, addDays(toDateKey(new Date()), 1));
  }
}

/** Text layer of a digital PDF. A scanned PDF has none; the app can photograph the pages instead. */
const pdfText = async (data: Buffer): Promise<string> => {
  let text = '';
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    text = (await extractText(pdf, { mergePages: true })).text.replace(/\s+/g, ' ').trim();
  } catch {
    throw unsupportedFile("Olive couldn't open that PDF. Try exporting it again, or photograph the pages.");
  }
  if (text.length < MIN_PDF_TEXT) {
    throw unsupportedFile('This PDF looks like a scan with no text layer. Photograph the report pages instead.');
  }
  return text.slice(0, MAX_PDF_TEXT);
};
