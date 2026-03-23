'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

type BrandInfo = {
    id: string;
    name: string;
    website: string | null;
    welcomeMessage: string;
};

type BrandKitInfo = {
    primaryColor: string;
    accentColor: string;
};

type ChatInterfaceProps = {
    brand: BrandInfo;
    brandKit: BrandKitInfo;
    logoUrl: string | null;
    previewMode?: boolean;
};

type DisplayMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    showWebsiteButton?: boolean;
};

const SUGGESTION_CHIPS = [
    'What products do you offer?',
    'Tell me about pricing',
    'How can I contact you?',
];

export function ChatInterface({ brand, brandKit, logoUrl, previewMode = false }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionToken, setSessionToken] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initialize session token
    useEffect(() => {
        const key = `voxa_chat_session_${brand.id}`;
        let token = sessionStorage.getItem(key);
        if (!token) {
            token = crypto.randomUUID();
            sessionStorage.setItem(key, token);
        }
        setSessionToken(token);
    }, [brand.id]);

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = useCallback(
        async (text: string) => {
            if (!text.trim() || isLoading || !sessionToken) return;

            const userMsg: DisplayMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                content: text.trim(),
            };
            setMessages((prev) => [...prev, userMsg]);
            setInput('');
            setIsLoading(true);

            try {
                const response = await fetch('/api/chatbot/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        brand_id: brand.id,
                        session_token: sessionToken,
                        message: text.trim(),
                        preview: previewMode,
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to get response');
                }

                const data = (await response.json()) as {
                    reply: string;
                    session_token: string;
                    show_website_button: boolean;
                };

                const botMsg: DisplayMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.reply,
                    showWebsiteButton: data.show_website_button,
                };
                setMessages((prev) => [...prev, botMsg]);
            } catch {
                const errorMsg: DisplayMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: 'Sorry, something went wrong. Please try again.',
                };
                setMessages((prev) => [...prev, errorMsg]);
            } finally {
                setIsLoading(false);
                inputRef.current?.focus();
            }
        },
        [brand.id, isLoading, previewMode, sessionToken]
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handleChipClick = (chip: string) => {
        sendMessage(chip);
    };

    const showChips = messages.length === 0;

    return (
        <div
            className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
            style={
                {
                    '--brand-primary': brandKit.primaryColor,
                    '--brand-accent': brandKit.accentColor,
                } as React.CSSProperties
            }
        >
            {/* Header */}
            <header
                className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200/60 px-5 py-4 backdrop-blur-xl"
                style={{ backgroundColor: `${brandKit.primaryColor}ee` }}
            >
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt={`${brand.name} logo`}
                        className="h-10 w-10 rounded-xl object-contain bg-gray-100 p-1"
                    />
                ) : (
                    <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-gray-900"
                        style={{ backgroundColor: brandKit.accentColor }}
                    >
                        {brand.name.slice(0, 2).toUpperCase()}
                    </div>
                )}
                <div>
                    <h1 className="text-base font-semibold text-gray-900">{brand.name}</h1>
                    <p className="text-xs text-white/60">AI Product Assistant</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    {previewMode ? (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
                            Local Preview
                        </span>
                    ) : null}
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-white/50">Online</span>
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-2xl space-y-4">
                    {/* Welcome message */}
                    <div className="flex gap-3">
                        <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-gray-900"
                            style={{ backgroundColor: brandKit.accentColor }}
                        >
                            {brand.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-gray-50/80 px-4 py-3 text-sm text-gray-700 border border-gray-200/50">
                            {brand.welcomeMessage}
                        </div>
                    </div>

                    {/* Suggestion Chips */}
                    {showChips && (
                        <div className="flex flex-wrap gap-2 pl-11">
                            {SUGGESTION_CHIPS.map((chip) => (
                                <button
                                    key={chip}
                                    type="button"
                                    onClick={() => handleChipClick(chip)}
                                    className="rounded-full border border-gray-200 bg-gray-50/60 px-4 py-2 text-xs text-gray-600 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
                                    style={{
                                        borderColor: `${brandKit.accentColor}40`,
                                    }}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Messages */}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            {msg.role === 'assistant' && (
                                <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-gray-900"
                                    style={{ backgroundColor: brandKit.accentColor }}
                                >
                                    {brand.name.slice(0, 1).toUpperCase()}
                                </div>
                            )}
                            <div className="space-y-2">
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user'
                                            ? 'rounded-tr-sm text-white'
                                            : 'rounded-tl-sm bg-gray-50/80 text-gray-700 border border-gray-200/50'
                                        }`}
                                    style={
                                        msg.role === 'user'
                                            ? { backgroundColor: brandKit.primaryColor }
                                            : undefined
                                    }
                                >
                                    {msg.role === 'assistant' ? (
                                        <ReactMarkdown
                                            components={{
                                                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                                                ul: ({ children }) => <ul className="mb-2 space-y-1 pl-4 list-disc list-outside">{children}</ul>,
                                                ol: ({ children }) => <ol className="mb-2 space-y-1 pl-4 list-decimal list-outside">{children}</ol>,
                                                li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
                                                strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                                                h1: ({ children }) => <h1 className="mb-2 text-base font-bold text-gray-900">{children}</h1>,
                                                h2: ({ children }) => <h2 className="mb-1.5 text-sm font-bold text-gray-900">{children}</h2>,
                                                h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold text-gray-800">{children}</h3>,
                                                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-700">{children}</a>,
                                                code: ({ children }) => <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono text-gray-800">{children}</code>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                                {msg.showWebsiteButton && brand.website && (
                                    <a
                                        href={brand.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-0 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5 text-xs font-medium text-gray-900 transition hover:bg-gray-100"
                                        style={{
                                            borderColor: `${brandKit.accentColor}60`,
                                            color: brandKit.accentColor,
                                        }}
                                    >
                                        <span>Web</span>
                                        Visit {brand.name} website {'->'}
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Typing Indicator */}
                    {isLoading && (
                        <div className="flex gap-3">
                            <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-gray-900"
                                style={{ backgroundColor: brandKit.accentColor }}
                            >
                                {brand.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-gray-50/80 px-4 py-3 border border-gray-200/50">
                                <span
                                    className="h-2 w-2 rounded-full animate-bounce"
                                    style={{ backgroundColor: brandKit.accentColor, animationDelay: '0ms' }}
                                />
                                <span
                                    className="h-2 w-2 rounded-full animate-bounce"
                                    style={{ backgroundColor: brandKit.accentColor, animationDelay: '150ms' }}
                                />
                                <span
                                    className="h-2 w-2 rounded-full animate-bounce"
                                    style={{ backgroundColor: brandKit.accentColor, animationDelay: '300ms' }}
                                />
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>
            </main>

            {/* Input Bar */}
            <div className="sticky bottom-0 border-t border-gray-200/60 bg-white/90 px-4 py-4 backdrop-blur-xl">
                <form
                    onSubmit={handleSubmit}
                    className="mx-auto flex max-w-2xl items-center gap-3"
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        className="flex-1 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-cyan-500 focus:ring-1 disabled:opacity-50"
                        style={{
                            focusBorderColor: brandKit.accentColor,
                        } as React.CSSProperties}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition disabled:opacity-40"
                        style={{ backgroundColor: brandKit.primaryColor }}
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </button>
                </form>
            </div>

            {/* Footer */}
            <div className="py-3 text-center">
                <a
                    href="https://voxa.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-slate-600 transition hover:text-gray-400"
                >
                    Powered by Voxa
                </a>
            </div>
        </div>
    );
}
