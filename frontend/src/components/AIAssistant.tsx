import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2, Scissors, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// NOTE: This component's logic is largely the same, but the styling is updated
// to fit the new, sleek sidebar design.

function AIAssistant({ videoId, videoContext, onToolComplete }) {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        if (videoId && videoContext) {
            initializeAssistant();
        }
    }, [videoId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const initializeAssistant = async () => {
        try {
            const response = await axios.post(
                `${import.meta.env.VITE_API_BASE}/api/assistant/start/${videoId}`,
                videoContext
            );
            setMessages([{
                role: 'assistant',
                content: response.data.message
            }]);
        } catch (error) {
            setMessages([{
                role: 'assistant',
                content: "I'm ready to help! What would you like to do with your video? You can ask me to `Remove all filler words` or `Create a 60-second highlight reel`."
            }]);
        }
    };
    
    const sendMessage = async () => {
        if (!inputMessage.trim() || isLoading) return;

        const userMessage = { role: 'user', content: inputMessage.trim() };
        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(true);

        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE}/api/assistant/chat/${videoId}`, {
                message: userMessage.content
            });

            const assistantMessage = {
                role: 'assistant',
                content: response.data.response,
                tool_calls: response.data.tool_calls,
                tool_results: response.data.tool_results,
            };

            setMessages(prev => [...prev, assistantMessage]);

            if (response.data.tool_results && onToolComplete) {
                response.data.tool_results.forEach(onToolComplete);
            }

        } catch (error) {
            console.error('Failed to send message:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '❌ I had trouble processing that request. Please try again.',
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[hsl(var(--background))]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message, index) => (
                    <div key={index} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                        {message.role === 'assistant' && <Bot className="w-6 h-6 flex-shrink-0 text-white mt-1" />}
                        <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${message.role === 'user' ? 'bg-white text-black rounded-br-none' : 'bg-[hsl(var(--secondary))] text-white rounded-bl-none'}`}>
                            <div className="prose prose-sm prose-invert max-w-none">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                            </div>
                            {message.tool_calls && (
                                <div className="mt-3 p-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded">
                                    <h5 className="font-semibold text-xs mb-1 flex items-center gap-1.5"><Zap className="w-3 h-3"/> Actions Performed:</h5>
                                    <ul className="text-xs space-y-1">
                                        {message.tool_calls.map((call, i) => (
                                            <li key={i}><strong>{call.function.name}</strong></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                         {message.role === 'user' && <User className="w-6 h-6 flex-shrink-0 text-white mt-1" />}
                    </div>
                ))}
                {isLoading && (
                     <div className="flex gap-3">
                        <Bot className="w-6 h-6 flex-shrink-0 text-white mt-1" />
                        <div className="max-w-[85%] rounded-2xl p-3 bg-[hsl(var(--secondary))] text-white rounded-bl-none">
                             <div className="typing-indicator flex gap-1.5 items-center">
                                <span className="w-2 h-2 bg-[hsl(var(--muted-foreground))] rounded-full animate-bounce"></span>
                                <span className="w-2 h-2 bg-[hsl(var(--muted-foreground))] rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></span>
                                <span className="w-2 h-2 bg-[hsl(var(--muted-foreground))] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>
            
            {/* Input */}
            <div className="p-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                 <div className="relative">
                    <textarea
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                        placeholder="e.g., 'Remove all pauses longer than 2 seconds'"
                        disabled={isLoading}
                        rows={1}
                        className="w-full p-3 pr-12 bg-[hsl(var(--secondary))] text-white border border-[hsl(var(--border))] rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-white"
                    />
                    <button 
                        onClick={sendMessage}
                        disabled={isLoading || !inputMessage.trim()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-white text-black rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AIAssistant;