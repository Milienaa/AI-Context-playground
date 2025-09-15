import React, { useState, useEffect, useRef } from 'react';
import { Message, MessageRole } from './types';
import { sendMessageToGemini, resetChat } from './services/geminiService';
import Header from './components/Header';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import { AssistantIcon } from './components/Icons';

const initialMessage: Message = {
  id: 'initial-message',
  role: MessageRole.MODEL,
  content: "Привіт! Я ваш асистент. Що б ви хотіли створити, спланувати або організувати сьогодні?",
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [isLoading, setIsLoading] = useState(false);
  const [projectContext, setProjectContext] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<{ input: number; output: number } | null>(null);
  const [useContextTool, setUseContextTool] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);

  // NEW: один проєкт на чат
  const [projectId, setProjectId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const resetStateForNewSession = () => {
    resetChat();
    setMessages([initialMessage]);
    setProjectContext(null);
    setTokenCount(null);
    setProjectId(null); // NEW: починаємо новий проєкт
  };
  
  const handleToolToggle = () => {
    setUseContextTool(prev => !prev);
    resetStateForNewSession();
  };

  const handleHistoryToggle = () => {
    setIncludeHistory(prev => !prev);
    resetStateForNewSession();
  };

  const handleSendMessage = async (userMessage: string) => {
    if (!userMessage.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      content: userMessage,
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // NEW: передаємо поточний projectId, щоб додавати сторінки у той самий проєкт
      const response = await sendMessageToGemini(
        userMessage,
        useContextTool,
        includeHistory,
        projectId ?? undefined
      );

      if (response.projectContext) {
        setProjectContext(response.projectContext);
      }
      
      setTokenCount({ input: response.inputTokens, output: response.outputTokens });

      // NEW: зберігаємо/оновлюємо projectId з відповіді (після першого запиту він з'явиться)
      if (response.projectId && response.projectId !== projectId) {
        setProjectId(response.projectId);
      }

      // Якщо є URL від xTiles — показуємо клікабельний лінк-стікер; інакше — фолбек на текст
      const contentForChat =
        response.projectUrl && response.projectUrl.length > 0
          ? `[Відкрити проєкт](${response.projectUrl})`
          : (response.text?.trim() || "Не вдалося отримати посилання на проєкт.");

      const newAssistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.MODEL,
        content: contentForChat,
        sources: response.sources,
      };
      setMessages((prev) => [...prev, newAssistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: MessageRole.MODEL,
        content: 'Вибачте, виникла помилка. Спробуйте, будь ласка, пізніше.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-gray-100 flex font-sans">
      {/* Main Chat Panel */}
      <div className="flex-grow flex flex-col h-screen">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 space-y-8 py-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-gray-800 text-cyan-400">
                  <AssistantIcon className="h-6 w-6" />
                </div>
                <div className="max-w-xl p-4 rounded-2xl rounded-bl-lg bg-gray-700 text-gray-200">
                  <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 bg-cyan-400 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>

      {/* Side Panel */}
      <aside className="w-96 flex-shrink-0 bg-gray-950 border-l border-gray-800 h-screen flex flex-col">
        {/* Settings */}
        <div className="p-6 border-b border-gray-800 flex-shrink-0">
            <h2 className="text-lg font-semibold text-cyan-400 mb-4">Налаштування</h2>
            <div className="flex items-center justify-between">
                <label htmlFor="tool-toggle" className="text-sm text-gray-300 cursor-pointer">Використовувати контекст</label>
                <label htmlFor="tool-toggle" className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={useContextTool} onChange={handleToolToggle} id="tool-toggle" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-offset-gray-950 peer-focus:ring-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
            </div>
             <p className="text-xs text-gray-500 mt-2">
                {useContextTool
                    ? "Увімкнено. Асистент створює та підтримує єдиний, цілісний контекст для всього проєкту."
                    : "Вимкнено. Асистент працює в режимі запит-відповідь без збереження загального контексту."}
            </p>
            <div className="flex items-center justify-between mt-4">
                <label htmlFor="history-toggle" className="text-sm text-gray-300 cursor-pointer">Включати історію</label>
                <label htmlFor="history-toggle" className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={includeHistory} onChange={handleHistoryToggle} id="history-toggle" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-offset-gray-950 peer-focus:ring-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
            </div>
             <p className="text-xs text-gray-500 mt-2">
                {includeHistory
                    ? "Увімкнено. Кожне нове повідомлення враховує попередні для кращого контексту."
                    : "Вимкнено. Кожен запит обробляється ізольовано, без історії розмови."}
            </p>
        </div>

        {/* Project Context */}
        <div className="p-6 border-b border-gray-800 flex-shrink-0">
            <h2 className="text-lg font-semibold text-cyan-400">Контекст проєкту</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-gray-300 text-sm">
            {projectContext ? (
                <p className="whitespace-pre-wrap leading-relaxed">{projectContext}</p>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.375 3.375 0 0014 18.442V19.5a3 3 0 01-6 0v-1.059a3.375 3.375 0 00-.75-2.122л-.547-.547z" />
                    </svg>
                    <p className="mt-4 font-semibold">Єдиний контекст проєкту з'явиться тут</p>
                    <p className="text-xs mt-1">Він відображає головну мету та деталі, що оновлюються з кожним вашим запитом.</p>
                </div>
            )}
        </div>
        
        {/* Token Usage */}
        <div className="p-6 border-t border-gray-800 flex-shrink-0">
          <h3 className="text-md font-semibold text-cyan-400 mb-3">Використання токенів</h3>
          {tokenCount ? (
            <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Input Tokens:</span>
                    <span className="font-mono bg-gray-800 px-2 py-1 rounded-md text-gray-200">{tokenCount.input}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">Output Tokens:</span>
                    <span className="font-mono bg-gray-800 px-2 py-1 rounded-md text-gray-200">{tokenCount.output}</span>
                </div>
            </div>
          ) : (
             <p className="text-xs text-gray-500">Інформація про токени з’явиться після першого запиту.</p>
          )}
        </div>
      </aside>
    </div>
  );
};

export default App;