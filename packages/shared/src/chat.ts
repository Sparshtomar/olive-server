import { z } from 'zod';
import { DATE_KEY_REGEX } from './dates';

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Longest message a user can send in one turn. */
export const CHAT_MESSAGE_MAX = 2000;

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** The most recent message, for the list. */
  lastMessage: string | null;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  /** API-relative URL of an attached image, when the user sent one. */
  imageUrl: string | null;
  createdAt: string;
}

/**
 * One turn. `conversationId` is omitted to start a new conversation. `today` is the
 * device's local date so "today's meals" in the answer means the user's today.
 */
export const sendChatMessageSchema = z.object({
  conversationId: z.uuid().optional(),
  text: z.string().trim().max(CHAT_MESSAGE_MAX),
  today: z.string().regex(DATE_KEY_REGEX),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

/** The server answers synchronously: both sides of the turn come back together. */
export interface ChatReply {
  conversation: ChatConversation;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}
