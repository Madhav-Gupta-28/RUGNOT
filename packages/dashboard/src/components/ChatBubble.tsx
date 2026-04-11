import { SecurityBadge } from './SecurityBadge';
import type { Verdict } from '../lib/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  verdict?: Verdict;
}

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-xl px-4 py-3 ${isUser ? 'rounded-br-none bg-bg-elevated' : 'rounded-bl-none border border-border bg-bg-surface'}`}>
        <p className="font-sans text-sm leading-relaxed text-primary">{message.text}</p>
        {message.verdict ? (
          <div className="mt-3 flex items-center gap-2">
            <SecurityBadge level={message.verdict.level} />
            <span className="font-mono text-xs text-secondary">score {message.verdict.score}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
