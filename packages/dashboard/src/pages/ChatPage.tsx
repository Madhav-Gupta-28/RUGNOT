import { useRef, useState } from 'react';

import { apiPost } from '../lib/api';
import { ChatBubble, type ChatMessage } from '../components/ChatBubble';
import { ChatInput } from '../components/ChatInput';

interface ChatResponse {
  reply: string;
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'hello',
      role: 'agent',
      text: 'RUGNOT is online. Ask me about scans, threats, portfolio risk, or x402 earnings.',
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = async (message: string) => {
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text: message,
    };
    setMessages((current) => [...current, userMessage]);
    setIsSending(true);

    try {
      const response = await apiPost<ChatResponse>('/api/chat', { message });
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-agent`,
          role: 'agent',
          text: response.reply,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-agent-error`,
          role: 'agent',
          text: 'I cannot reach the backend right now. Start the agent on port 3001 and try again.',
        },
      ]);
    } finally {
      setIsSending(false);
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-7rem)] flex-col">
      <section className="mb-4">
        <h1 className="font-sans text-2xl font-bold text-primary">Chat</h1>
        <p className="mt-1 font-sans text-sm text-secondary">Ask the agent for portfolio safety, opportunities, and revenue status.</p>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-bg/40 p-4">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput onSend={sendMessage} isSending={isSending} />
    </div>
  );
}
