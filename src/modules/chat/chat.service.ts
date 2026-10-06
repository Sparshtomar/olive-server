import {
  MARKER_CATALOG,
  NUTRIENT_META,
  formatRange,
  type ChatConversation,
  type ChatMessage,
  type ChatReply,
  type DateKey,
  type User,
} from '@sparshtomar/olive-shared';
import type { AssistantTurn, BinaryInput, HealthAssistant } from '../../ai';
import { notFound, validation } from '../../lib/errors';
import type { ProgressService } from '../progress';
import type { ReportService } from '../reports';
import { toConversation, toMessage } from './chat.mapper';
import type { ChatRepository } from './chat.repository';

export interface AskInput {
  conversationId?: string;
  text: string;
  today: DateKey;
  image?: BinaryInput;
}

const TITLE_MAX = 60;

/**
 * Olive's chat. Every answer is grounded in the user's own data — profile, targets,
 * today's meals, every tracked lab marker — assembled here and handed to the model as
 * plain text, so the model explains the user's numbers rather than inventing them.
 * The turn is written only after the model has answered: a failed call saves nothing.
 */
export class ChatService {
  constructor(
    private readonly chats: ChatRepository,
    private readonly progress: ProgressService,
    private readonly reports: ReportService,
    private readonly assistant: HealthAssistant,
  ) {}

  async list(userId: string): Promise<ChatConversation[]> {
    return (await this.chats.listConversations(userId)).map(toConversation);
  }

  async messages(userId: string, conversationId: string): Promise<ChatMessage[]> {
    await this.requireConversation(userId, conversationId);
    return (await this.chats.listMessages(conversationId)).map(toMessage);
  }

  async ask(user: User, input: AskInput): Promise<ChatReply> {
    if (!input.text && !input.image) throw validation('Say something, or attach a photo');

    const conversation = input.conversationId
      ? await this.requireConversation(user.id, input.conversationId)
      : await this.chats.createConversation(user.id, titleFor(input.text, !!input.image));

    const [history, context] = await Promise.all([
      this.chats.listMessages(conversation.id),
      this.buildContext(user, input.today),
    ]);
    const turns: AssistantTurn[] = history.map((m) => ({ role: m.role, content: m.content }));
    const reply = await this.assistant.reply({ context, history: turns, text: input.text, image: input.image });

    const { userMessage, assistantMessage } = await this.chats.appendTurn(
      conversation.id,
      { content: input.text, attachment: input.image },
      { content: reply },
    );
    const fresh = (await this.chats.findConversation(user.id, conversation.id)) ?? conversation;
    return {
      conversation: toConversation(fresh),
      userMessage: toMessage(userMessage),
      assistantMessage: toMessage(assistantMessage),
    };
  }

  async attachment(messageId: string) {
    const file = await this.chats.findAttachment(messageId);
    if (!file) throw notFound('Image');
    return file;
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    if (!(await this.chats.deleteConversation(userId, conversationId))) throw notFound('Conversation');
  }

  /** What the assistant knows about this user, as text a model can quote from. */
  async buildContext(user: User, today: DateKey): Promise<string> {
    const [day, markers] = await Promise.all([
      this.progress.day(user, today),
      this.reports.markerTrends(user.id, user.sex),
    ]);
    const t = user.targets;
    const eaten = day.totals;

    const lines: string[] = [
      `User: ${user.name}, ${user.sex}, ${user.age} y, ${user.heightCm} cm, ${user.weightKg} kg, activity ${user.activityLevel}, goal ${user.goalType}${user.paceKgPerWeek ? ` at ${user.paceKgPerWeek} kg/week` : ''}.`,
      `Daily targets: ${t.calories} kcal, protein ${t.protein} g, carbs ${t.carbs} g, fat ${t.fat} g.`,
      `Today (${today}) so far: ${Math.round(eaten.calories)} kcal, protein ${Math.round(eaten.protein)} g, carbs ${Math.round(eaten.carbs)} g, fat ${Math.round(eaten.fat)} g, fiber ${Math.round(eaten.fiber)} g, sugar ${Math.round(eaten.sugar)} g, saturated fat ${Math.round(eaten.saturatedFat)} g.`,
      day.meals.length
        ? `Meals today: ${day.meals.map((m) => `${m.slot} — ${m.title} (${Math.round(m.totals.calories)} kcal)`).join('; ')}.`
        : 'No meals logged yet today.',
    ];

    if (day.focus.length) {
      lines.push(
        'Nutrition focus from lab reports: ' +
          day.focus
            .map(
              (f) =>
                `${NUTRIENT_META[f.nutrient].label} ${f.kind === 'max' ? 'under' : 'at least'} ${f.amount} ${NUTRIENT_META[f.nutrient].unit}/day (today ${f.consumed}) because of ${f.reasons.map((r) => r.name).join(', ')}`,
            )
            .join('; ') +
          '.',
      );
    }

    if (markers.length) {
      lines.push('Lab markers (latest reading, healthy range, status):');
      for (const m of markers) {
        const def = MARKER_CATALOG[m.key];
        const trend =
          m.history.length > 1
            ? `, ${m.history.length} readings, first ${m.history[0]!.value} on ${m.history[0]!.date}`
            : '';
        lines.push(
          `- ${m.name}: ${m.latest.value} ${m.unit} on ${m.latest.date}, healthy ${formatRange(m.range, m.unit)}, status ${m.latest.status.toUpperCase()}${trend}.${def.tips[m.latest.status === 'normal' ? 'high' : m.latest.status] && m.latest.status !== 'normal' ? ` Tip: ${def.tips[m.latest.status]}` : ''}`,
        );
      }
    } else {
      lines.push('No lab reports uploaded yet.');
    }
    return lines.join('\n');
  }

  private async requireConversation(userId: string, id: string) {
    const conversation = await this.chats.findConversation(userId, id);
    if (!conversation) throw notFound('Conversation');
    return conversation;
  }
}

/** First words of the first message make the title; a photo-only opener gets a generic one. */
const titleFor = (text: string, hasImage: boolean): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return hasImage ? 'About a photo' : 'New chat';
  return clean.length <= TITLE_MAX ? clean : `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…`;
};
