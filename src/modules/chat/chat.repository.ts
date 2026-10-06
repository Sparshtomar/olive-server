import { and, desc, eq, sql } from 'drizzle-orm';
import type { ChatRole } from '@sparshtomar/olive-shared';
import type { Database } from '../../db/client';
import { chatAttachments, chatConversations, chatMessages } from '../../db/schema';

export interface AttachmentData {
  mimeType: string;
  data: Buffer;
}

export type ConversationRow = typeof chatConversations.$inferSelect & {
  lastMessage: string | null;
  messageCount: number;
};
export type MessageRow = typeof chatMessages.$inferSelect;

export class ChatRepository {
  constructor(private readonly db: Database) {}

  async createConversation(userId: string, title: string): Promise<ConversationRow> {
    const [row] = await this.db.insert(chatConversations).values({ userId, title }).returning();
    return { ...row!, lastMessage: null, messageCount: 0 };
  }

  /** Newest activity first, each with its last message and size for the list. */
  async listConversations(userId: string): Promise<ConversationRow[]> {
    return this.db
      .select({
        ...conversationColumns,
        ...conversationExtras,
      })
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.updatedAt));
  }

  async findConversation(userId: string, id: string): Promise<ConversationRow | undefined> {
    const rows = await this.db
      .select({
        ...conversationColumns,
        ...conversationExtras,
      })
      .from(chatConversations)
      .where(and(eq(chatConversations.userId, userId), eq(chatConversations.id, id)));
    return rows[0];
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  /** Writes a user turn (with optional image) and the assistant's answer atomically, and bumps the conversation. */
  async appendTurn(
    conversationId: string,
    user: { content: string; attachment?: AttachmentData },
    assistant: { content: string },
  ): Promise<{ userMessage: MessageRow; assistantMessage: MessageRow }> {
    return this.db.transaction(async (tx) => {
      const [userMessage] = await tx
        .insert(chatMessages)
        .values({ conversationId, role: 'user' satisfies ChatRole, content: user.content, hasImage: !!user.attachment })
        .returning();
      if (user.attachment) await tx.insert(chatAttachments).values({ messageId: userMessage!.id, ...user.attachment });
      const [assistantMessage] = await tx
        .insert(chatMessages)
        .values({ conversationId, role: 'assistant' satisfies ChatRole, content: assistant.content })
        .returning();
      await tx.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, conversationId));
      return { userMessage: userMessage!, assistantMessage: assistantMessage! };
    });
  }

  async findAttachment(messageId: string): Promise<AttachmentData | undefined> {
    const rows = await this.db
      .select({ mimeType: chatAttachments.mimeType, data: chatAttachments.data })
      .from(chatAttachments)
      .where(eq(chatAttachments.messageId, messageId));
    return rows[0];
  }

  async deleteConversation(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(chatConversations)
      .where(and(eq(chatConversations.userId, userId), eq(chatConversations.id, id)))
      .returning({ id: chatConversations.id });
    return deleted.length > 0;
  }
}

/**
 * Per-conversation summary columns, as raw SQL on purpose: inside a `sql` template on a
 * single-table select Drizzle renders column refs unqualified, so a correlated
 * `conversation_id = id` would compare against chat_messages.id and never match.
 */
const conversationExtras = {
  lastMessage: sql<
    string | null
  >`(select m.content from chat_messages m where m.conversation_id = chat_conversations.id order by m.created_at desc limit 1)`,
  messageCount: sql<number>`(select count(*)::int from chat_messages m where m.conversation_id = chat_conversations.id)`,
};

const conversationColumns = {
  id: chatConversations.id,
  userId: chatConversations.userId,
  title: chatConversations.title,
  createdAt: chatConversations.createdAt,
  updatedAt: chatConversations.updatedAt,
};
