import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Volume2, Film, TrendingUp } from 'lucide-react';

function VideoContext({ videoId, analysisResult }) {
    const [contextData, setContextData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (videoId && analysisResult) {
            storeVideoContext();
        }
    }, [videoId, analysisResult]);

    const storeVideoContext = async () => {
        setIsLoading(true);
        try {
            // Store the enhanced context for AI assistant
            const contextPayload = {
                videoId,
                scenes: analysisResult.scenes || [],
                transcript: analysisResult.transcript || {},
                filler_words: analysisResult.filler_words || [],
                silence_gaps: analysisResult.silence_gaps || [],
                analysis: analysisResult.analysis || {},
                editing_suggestions: analysisResult.editing_suggestions || []
            };

            // await axios.post(`${import.meta.env.VITE_API_BASE}/api/context/store`, contextPayload);
            setContextData(contextPayload);
        } catch (error) {
            console.error('Failed to store video context:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!contextData) {
        return (
            <div className="video-context bg-gray-50 p-4 rounded-lg">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    const { analysis, editing_suggestions, filler_words, silence_gaps, scenes } = contextData;

    return (
        <div className="video-context bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Video Analysis
            </h3>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="metric bg-blue-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">Duration</span>
                    </div>
                    <div className="text-lg font-bold text-blue-800">
                        {analysis?.total_duration ? `${(analysis.total_duration / 60).toFixed(1)}m` : 'N/A'}
                    </div>
                </div>
                
                <div className="metric bg-red-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <Volume2 className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-900">Filler Words</span>
                    </div>
                    <div className="text-lg font-bold text-red-800">
                        {filler_words?.length || 0}
                    </div>
                </div>
                
                <div className="metric bg-yellow-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-900">Long Pauses</span>
                    </div>
                    <div className="text-lg font-bold text-yellow-800">
                        {silence_gaps?.length || 0}
                    </div>
                </div>
                
                <div className="metric bg-green-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <Film className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-900">Scenes</span>
                    </div>
                    <div className="text-lg font-bold text-green-800">
                        {scenes?.length || 0}
                    </div>
                </div>
            </div>

            {/* Editing Opportunities */}
            {editing_suggestions && editing_suggestions.length > 0 && (
                <div className="editing-suggestions">
                    <h4 className="font-semibold mb-3 text-gray-800">💡 Editing Suggestions</h4>
                    <div className="space-y-2">
                        {editing_suggestions.map((suggestion, index) => (
                            <div 
                                key={index}
                                className={`p-3 rounded-lg border-l-4 ${
                                    suggestion.impact === 'high' ? 'bg-red-50 border-red-400' :
                                    suggestion.impact === 'medium' ? 'bg-yellow-50 border-yellow-400' :
                                    'bg-blue-50 border-blue-400'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-medium text-gray-900">{suggestion.description}</p>
                                        {suggestion.time_saved && (
                                            <p className="text-sm text-gray-600 mt-1">
                                                ⏱️ Time saved: {suggestion.time_saved.toFixed(1)}s
                                            </p>
                                        )}
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                        suggestion.impact === 'high' ? 'bg-red-100 text-red-800' :
                                        suggestion.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {suggestion.impact} impact
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Speech Analysis */}
            {analysis && (
                <div className="speech-analysis mt-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold mb-2">📊 Speech Analysis</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-600">Speech Rate:</span>
                            <span className="ml-2 font-medium">
                                {analysis.words_per_minute ? `${analysis.words_per_minute.toFixed(0)} WPM` : 'N/A'}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-600">Filler %:</span>
                            <span className="ml-2 font-medium">
                                {analysis.filler_percentage ? `${analysis.filler_percentage.toFixed(1)}%` : 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default VideoContext;