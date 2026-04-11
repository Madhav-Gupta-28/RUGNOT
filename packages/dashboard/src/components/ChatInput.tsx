import { FormEvent, useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isSending: boolean;
}

const quickActions = ['Scan for opportunities', 'Check portfolio safety', 'Show earnings'];

export function ChatInput({ onSend, isSending }: ChatInputProps) {
  const [value, setValue] = useState('');

  const submit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || isSending) {
      return;
    }
    onSend(trimmed);
    setValue('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(value);
  };

  return (
    <div className="border-t border-border bg-bg px-1 pt-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => submit(action)}
            className="rounded-full border border-border bg-bg-surface px-3 py-1.5 font-sans text-xs text-secondary transition hover:border-accent-safe/40 hover:bg-bg-elevated hover:text-primary"
          >
            {action}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex gap-3">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask RUGNOT about scans, threats, or earnings..."
          className="min-w-0 flex-1 rounded-full border border-border bg-bg-elevated px-4 py-2 font-sans text-sm text-primary outline-none transition placeholder:text-secondary focus:border-accent-safe/60"
        />
        <button
          type="submit"
          disabled={isSending}
          className="rounded-full bg-accent-safe px-4 py-2 font-sans text-sm font-bold text-black transition hover:bg-accent-safe/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
