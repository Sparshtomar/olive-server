import type { ChatConversation, ChatMessage } from '@sparshtomar/olive-shared';
import type { ConversationRow, MessageRow } from './chat.repository';

export const toConversation = (row: ConversationRow): ChatConversation => ({
  id: row.id,
  title: row.title,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  lastMessage: row.lastMessage,
  messageCount: row.messageCount,
});

export const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  conversationId: row.conversationId,
  role: row.role,
  content: row.content,
  imageUrl: row.hasImage ? `/chat/attachments/${row.id}` : null,
  createdAt: row.createdAt.toISOString(),
});
