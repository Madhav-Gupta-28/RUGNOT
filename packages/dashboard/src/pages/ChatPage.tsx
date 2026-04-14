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
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#1a1a1a] pb-6 mt-4 shrink-0">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">AGENT INTERFACE</div>
          <h1 className="font-sans text-3xl font-bold text-primary tracking-tight">Copilot Terminal</h1>
        </div>
        <div className="flex gap-8 sm:gap-12 text-left md:text-right">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2 flex items-center gap-2 justify-start md:justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-safe animate-pulse-safe" />
              INTELLIGENCE
            </div>
            <div className="font-mono text-2xl text-primary tracking-widest text-[16px]">GEMINI 2.5</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto terminal-panel rounded-md border border-[#1a1a1a] bg-[#050505] p-4 sm:p-6">
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
