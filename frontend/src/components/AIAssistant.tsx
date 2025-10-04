import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2, Scissors, Zap, Clock, Film } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function AIAssistant({ videoId, videoContext }) {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState({
        initializing: false,
        sending: false
    });
    const [assistantReady, setAssistantReady] = useState(false);
    const [editingResults, setEditingResults] = useState([]);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (videoId) {
            initializeAssistant();
        }
    }, [videoId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const initializeAssistant = async () => {
        setIsLoading(prev => ({ ...prev, initializing: true }));
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE}/assistant/start/${videoId}`);
            
            const welcomeMessage = {
                role: 'assistant',
                content: response.data.message,
                timestamp: new Date(),
                type: 'welcome'
            };
            
            setMessages([welcomeMessage]);
            setAssistantReady(true);
        } catch (error) {
            console.error('Failed to initialize assistant:', error);
            setMessages([{
                role: 'system',
                content: '❌ Failed to initialize AI assistant. Please ensure your video has been processed and try again.',
                timestamp: new Date(),
                type: 'error'
            }]);
        } finally {
            setIsLoading(prev => ({ ...prev, initializing: false }));
        }
    };

    const sendMessage = async () => {
        if (!inputMessage.trim() || !assistantReady || isLoading.sending) return;

        const userMessage = {
            role: 'user',
            content: inputMessage.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(prev => ({ ...prev, sending: true }));

        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE}/assistant/chat/${videoId}`, {
                message: userMessage.content
            });

            const assistantMessage = {
                role: 'assistant',
                content: response.data.response,
                timestamp: new Date(),
                tool_calls: response.data.tool_calls,
                tool_results: response.data.tool_results,
                type: response.data.tool_calls ? 'action' : 'response'
            };

            setMessages(prev => [...prev, assistantMessage]);

            // Track editing results
            if (response.data.tool_results) {
                const newResults = response.data.tool_results.filter(result => 
                    result.output.includes('✅')
                );
                setEditingResults(prev => [...prev, ...newResults]);
            }

        } catch (error) {
            console.error('Failed to send message:', error);
            setMessages(prev => [...prev, {
                role: 'system',
                content: '❌ Failed to process your request. Please try again.',
                timestamp: new Date(),
                type: 'error'
            }]);
        } finally {
            setIsLoading(prev => ({ ...prev, sending: false }));
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleQuickAction = (action) => {
        setInputMessage(action);
        inputRef.current?.focus();
    };

    const formatTimestamp = (timestamp) => {
        return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const MessageContent = ({ message }) => {
        const getMessageIcon = () => {
            switch (message.role) {
                case 'user': return <User className="w-4 h-4" />;
                case 'assistant': return <Bot className="w-5 h-5" />;
                default: return null;
            }
        };

        const getMessageStyle = () => {
            switch (message.type) {
                case 'welcome': return 'bg-blue-50 border-blue-200';
                case 'action': return 'bg-green-50 border-green-200';
                case 'error': return 'bg-red-50 border-red-200';
                default: return message.role === 'user' ? 'bg-gray-50' : 'bg-white';
            }
        };

        return (
            <div className={`message ${message.role} p-4 rounded-lg border ${getMessageStyle()}`}>
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                        {getMessageIcon()}
                    </div>
                    
                    <div className="flex-1">
                        <div className="message-content prose prose-sm max-w-none">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                        
                        {message.tool_calls && (
                            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                    <Zap className="w-4 h-4" />
                                    Actions Performed:
                                </h5>
                                <ul className="text-sm space-y-1">
                                    {message.tool_calls.map((call, i) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <Scissors className="w-3 h-3" />
                                            <strong>{call.function.name}</strong>: {call.function.arguments.output_path || 'Processing...'}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {message.tool_results && (
                            <div className="mt-2 space-y-2">
                                {message.tool_results.map((result, i) => (
                                    <div key={i} className={`text-sm p-2 rounded ${
                                        result.output.includes('✅') ? 'bg-green-100 text-green-800' : 
                                        result.output.includes('❌') ? 'bg-red-100 text-red-800' : 
                                        'bg-gray-100'
                                    }`}>
                                        {result.output}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="text-xs text-gray-500 mt-2 text-right">
                    {formatTimestamp(message.timestamp)}
                </div>
            </div>
        );
    };

    return (
        <div className="ai-assistant-container bg-white rounded-lg shadow-lg overflow-hidden h-full flex flex-col">
            {/* Header */}
            <div className="chat-header bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Film className="w-6 h-6" />
                        <h3 className="text-lg font-semibold">AI Video Editor</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {assistantReady ? (
                            <span className="px-2 py-1 bg-green-500 text-xs rounded-full">Ready</span>
                        ) : isLoading.initializing ? (
                            <span className="px-2 py-1 bg-yellow-500 text-xs rounded-full flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            <span className="px-2 py-1 bg-red-500 text-xs rounded-full">Offline</span>
                        )}
                    </div>
                </div>
                
                {videoContext && (
                    <div className="mt-2 text-sm opacity-90">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {videoContext.filler_words?.length || 0} filler words
                            </div>
                            <div className="flex items-center gap-1">
                                <Loader2 className="w-4 h-4" />
                                {videoContext.silence_gaps?.length || 0} long pauses
                            </div>
                            <div className="flex items-center gap-1">
                                <Film className="w-4 h-4" />
                                {videoContext.scenes?.length || 0} scenes
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Messages */}
            <div className="chat-messages flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message, index) => (
                    <MessageContent key={index} message={message} />
                ))}
                
                {isLoading.sending && (
                    <div className="message assistant">
                        <div className="flex items-center gap-3 p-4">
                            <div className="p-2 bg-gray-200 rounded-full">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div className="typing-indicator flex gap-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div ref={chatEndRef} />
            </div>
            
            {/* Quick Actions */}
            {assistantReady && messages.length <= 1 && (
                <div className="suggested-actions p-4 bg-gray-50 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-3">Quick actions:</p>
                    <div className="grid grid-cols-1 gap-2">
                        <button 
                            onClick={() => handleQuickAction("Remove all filler words and long pauses to make the video more engaging")}
                            className="action-button p-2 text-left text-sm bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                        >
                            🎯 <strong>Clean Audio:</strong> Remove ums, ahs, and long pauses
                        </button>
                        <button 
                            onClick={() => handleQuickAction("Create a 60-second highlight reel with the most engaging moments")}
                            className="action-button p-2 text-left text-sm bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                        >
                            ✨ <strong>Highlight Reel:</strong> Extract the best 60 seconds
                        </button>
                        <button 
                            onClick={() => handleQuickAction("Extract separate clips for each main topic discussed in the video")}
                            className="action-button p-2 text-left text-sm bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                        >
                            📂 <strong>Topic Clips:</strong> Split by main topics
                        </button>
                        <button 
                            onClick={() => handleQuickAction("Speed up slow sections by 1.3x and enhance the audio quality")}
                            className="action-button p-2 text-left text-sm bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                        >
                            ⚡ <strong>Optimize:</strong> Speed up slow parts + enhance audio
                        </button>
                    </div>
                </div>
            )}
            
            {/* Input */}
            <div className="chat-input p-4 border-t bg-white">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={assistantReady ? "Ask me to edit your video... (e.g., 'Remove all filler words')" : "Please wait for assistant to initialize..."}
                        disabled={!assistantReady || isLoading.sending}
                        rows={2}
                        className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                    />
                    <button 
                        onClick={sendMessage}
                        disabled={!assistantReady || isLoading.sending || !inputMessage.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {isLoading.sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Editing Results Summary */}
            {editingResults.length > 0 && (
                <div className="editing-results p-4 bg-green-50 border-t">
                    <h4 className="font-semibold text-green-800 mb-2">✅ Completed Edits ({editingResults.length})</h4>
                    <div className="space-y-1 text-sm">
                        {editingResults.slice(-3).map((result, i) => (
                            <div key={i} className="text-green-700">
                                {result.output.replace('✅', '').trim()}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default AIAssistant;