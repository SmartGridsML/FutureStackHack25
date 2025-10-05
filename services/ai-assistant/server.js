import express from 'express';
import cors from 'cors';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const MCP_VIDEO_EDITOR_URL = 'http://mcp-video-editor:5007';

// Initialize Cerebras client
const client = new Cerebras({
    apiKey: CEREBRAS_API_KEY,
});

class VideoEditingAssistant {
    constructor() {
        this.conversations = new Map();
        this.videoContexts = new Map();
    }

    async startConversation(videoId, videoContext = {}) {
        this.conversations.set(videoId, []);
        this.videoContexts.set(videoId, videoContext);
        
        return { 
            message: `🎬 **AI Video Editor Ready!**\n\nI've analyzed your video and I'm ready to help you edit it professionally. I can:\n\n• **Clean Audio** - Remove filler words (ums, ahs) and long pauses\n• **Create Highlights** - Extract the most engaging moments\n• **Enhance Quality** - Improve audio levels and clarity\n\n**Video Analysis:**\n- Filler words detected: ${videoContext.filler_words?.length || 0}\n- Long pauses detected: ${videoContext.silence_gaps?.length || 0}\n- Scenes identified: ${videoContext.scenes?.length || 0}\n\nWhat would you like to do with your video?`
        };
    }

    async processMessage(videoId, userMessage) {
        const conversation = this.conversations.get(videoId) || [];
        const videoContext = this.videoContexts.get(videoId) || {};
        
        const messages = [
            { 
                role: 'system', 
                content: `You are an expert AI video editor with access to professional editing tools.

Available tools:
- remove_filler_words: Remove filler words like um, uh, er from video
- trim_silence: Remove long pauses and silence gaps
- create_highlight_reel: Create short highlight video from best moments
- enhance_audio: Improve audio quality with noise reduction and normalization

Current video analysis:
- Filler words: ${videoContext.filler_words?.length || 0} detected
- Long pauses: ${videoContext.silence_gaps?.length || 0} detected
- Scenes: ${videoContext.scenes?.length || 0} identified

When the user requests video editing, use the appropriate tools and provide helpful, professional responses about the editing process.`
            },
            ...conversation,
            { role: 'user', content: userMessage }
        ];

        // Define tools for Cerebras function calling
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'remove_filler_words',
                    description: 'Remove filler words like um, uh, er, like from video',
                    parameters: {
                        type: 'object',
                        properties: {
                            video_path: { 
                                type: 'string', 
                                description: 'Path to input video file' 
                            },
                            output_path: { 
                                type: 'string', 
                                description: 'Path for cleaned output video' 
                            }
                        },
                        required: ['video_path', 'output_path']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'trim_silence',
                    description: 'Remove long pauses and silence gaps from video',
                    parameters: {
                        type: 'object',
                        properties: {
                            video_path: { type: 'string' },
                            output_path: { type: 'string' },
                            min_silence_duration: { 
                                type: 'number', 
                                description: 'Minimum silence duration to remove in seconds',
                                default: 1.5 
                            }
                        },
                        required: ['video_path', 'output_path']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'create_highlight_reel',
                    description: 'Create highlight reel from best video moments',
                    parameters: {
                        type: 'object',
                        properties: {
                            video_path: { type: 'string' },
                            output_path: { type: 'string' },
                            target_duration: { 
                                type: 'number',
                                description: 'Target duration in seconds for highlight reel'
                            }
                        },
                        required: ['video_path', 'output_path', 'target_duration']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'enhance_audio',
                    description: 'Enhance audio quality with noise reduction and normalization',
                    parameters: {
                        type: 'object',
                        properties: {
                            video_path: { type: 'string' },
                            output_path: { type: 'string' },
                            normalize_audio: { type: 'boolean', default: true },
                            reduce_noise: { type: 'boolean', default: true }
                        },
                        required: ['video_path', 'output_path']
                    }
                }
            }
        ];

        try {
            // Use Llama 3.1-70B via Cerebras
            const response = await client.chat.completions.create({
                model: 'llama-4-maverick-17b-128e-instruct',
                messages,
                tools,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 1024
            });

            const assistantMessage = response.choices[0].message;
            
            // Execute any tool calls via MCP
            let toolResults = [];
            if (assistantMessage.tool_calls) {
                console.log(`Executing ${assistantMessage.tool_calls.length} tool calls...`);
                for (const toolCall of assistantMessage.tool_calls) {
                    const result = await this.executeMCPTool(videoId, toolCall, videoContext);
                    toolResults.push(result);
                }
            }
            
            // Update conversation
            conversation.push(
                { role: 'user', content: userMessage },
                assistantMessage
            );
            this.conversations.set(videoId, conversation);
            
            return {
                response: assistantMessage.content || "I've executed the requested video editing operations.",
                tool_calls: assistantMessage.tool_calls,
                tool_results: toolResults
            };

        } catch (error) {
            console.error('Cerebras API error:', error);
            
            // Fallback response - try to execute tools based on keywords
            let toolResults = [];
            const lowerMessage = userMessage.toLowerCase();
            
            if (lowerMessage.includes('filler') || lowerMessage.includes('um') || lowerMessage.includes('uh')) {
                console.log('Fallback: Executing remove_filler_words based on keywords');
                toolResults.push(await this.executeMCPTool(videoId, {
                    function: { name: 'remove_filler_words', arguments: '{}' },
                    id: 'fallback-filler'
                }, videoContext));
            }
            
            if (lowerMessage.includes('silence') || lowerMessage.includes('pause')) {
                console.log('Fallback: Executing trim_silence based on keywords');
                toolResults.push(await this.executeMCPTool(videoId, {
                    function: { name: 'trim_silence', arguments: '{}' },
                    id: 'fallback-silence'
                }, videoContext));
            }
            
            if (lowerMessage.includes('highlight') || lowerMessage.includes('best')) {
                console.log('Fallback: Executing create_highlight_reel based on keywords');
                toolResults.push(await this.executeMCPTool(videoId, {
                    function: { name: 'create_highlight_reel', arguments: '{"target_duration": 60}' },
                    id: 'fallback-highlights'
                }, videoContext));
            }
            
            if (lowerMessage.includes('audio') || lowerMessage.includes('enhance') || lowerMessage.includes('quality')) {
                console.log('Fallback: Executing enhance_audio based on keywords');
                toolResults.push(await this.executeMCPTool(videoId, {
                    function: { name: 'enhance_audio', arguments: '{}' },
                    id: 'fallback-audio'
                }, videoContext));
            }
            
            return {
                response: `I'll help you edit your video! Based on your request "${userMessage}", I'm executing the appropriate editing tools. ${toolResults.length > 0 ? 'Check the results below.' : 'Please be more specific about what editing you need.'}`,
                tool_calls: null,
                tool_results: toolResults
            };
        }
    }

    async executeMCPTool(videoId, toolCall, videoContext) {
        try {
            let args = {};
            try {
                args = JSON.parse(toolCall.function.arguments || '{}');
            } catch (e) {
                console.log('Could not parse tool arguments, using defaults');
                args = {};
            }
            
            // Add video context data and ALWAYS set correct paths (ignore AI-provided paths)
            const filename = videoContext.filename || `${videoId}.mp4`; // 🔧 FIX: Use actual filename from videoContext
            const baseVideoPath = `/app/uploads/${filename}`;
        
            if (toolCall.function.name === 'remove_filler_words') {
                args.filler_segments = videoContext.filler_words || [];
                args.video_path = baseVideoPath; // Always use correct path
                args.output_path = `/app/uploads/${videoId}_no_fillers.mp4`;
            } else if (toolCall.function.name === 'trim_silence') {
                args.silence_segments = videoContext.silence_gaps || [];
                args.video_path = baseVideoPath;
                args.output_path = `/app/uploads/${videoId}_trimmed.mp4`;
                args.min_silence_duration = args.min_silence_duration || 1.5;
            } else if (toolCall.function.name === 'create_highlight_reel') {
                args.highlights = videoContext.scenes?.slice(0, 5).map((scene, i) => ({
                    start: scene.start || i * 15,
                    end: scene.end || (i * 15) + 10,
                    description: scene.description || `Highlight ${i + 1}`,
                    engagement_score: scene.engagement_score || 0.8
                })) || [
                    { start: 0, end: 10, description: "Opening", engagement_score: 0.9 },
                    { start: 30, end: 40, description: "Key Point", engagement_score: 0.8 },
                    { start: 60, end: 70, description: "Conclusion", engagement_score: 0.7 }
                ];
                args.target_duration = args.target_duration || 60;
                args.video_path = baseVideoPath;
                args.output_path = `/app/uploads/${videoId}_highlights.mp4`;
            } else if (toolCall.function.name === 'enhance_audio') {
                args.video_path = baseVideoPath;
                args.output_path = `/app/uploads/${videoId}_enhanced.mp4`;
                args.normalize_audio = args.normalize_audio !== false;
                args.reduce_noise = args.reduce_noise !== false;
            }

            console.log(`🛠️  Executing MCP tool: ${toolCall.function.name}`);
            console.log(`📁 Input: ${args.video_path}`);
            console.log(`📄 Output: ${args.output_path}`);

            const response = await fetch(`${MCP_VIDEO_EDITOR_URL}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tool_name: toolCall.function.name,
                    arguments: args
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`MCP server error (${response.status}): ${errorText}`);
            }
            
            const result = await response.json();
            console.log(`✅ Tool execution result:`, result);
            
            return {
                tool_call_id: toolCall.id || 'unknown',
                output: result.success ? result.result.join('\n') : `❌ Error: ${result.error}`
            };

        } catch (error) {
            console.error(`❌ Error executing ${toolCall.function.name}:`, error);
            return {
                tool_call_id: toolCall.id || 'unknown',
                output: `❌ Error executing ${toolCall.function.name}: ${error.message}`
            };
        }
    }
}

const assistant = new VideoEditingAssistant();

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'AI Assistant Ready', 
        model: 'llama-4-maverick-17b-128e-instruct via Cerebras', 
        cerebras_configured: !!CEREBRAS_API_KEY,
        mcp_endpoint: MCP_VIDEO_EDITOR_URL
    });
});

// Initialize assistant for a video
app.post('/assistant/start/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const videoContext = req.body || {};
        
        console.log(`🎬 Starting assistant for video: ${videoId}`);
        console.log(`📊 Video context:`, {
            filler_words: videoContext.filler_words?.length || 0,
            silence_gaps: videoContext.silence_gaps?.length || 0,
            scenes: videoContext.scenes?.length || 0
        });
        
        const result = await assistant.startConversation(videoId, videoContext);
        res.json(result);
        
    } catch (error) {
        console.error('Failed to start assistant:', error);
        res.status(500).json({ 
            error: 'Failed to initialize assistant',
            message: "I'm having trouble starting up, but you can still try sending me editing requests!"
        });
    }
});

// Chat with assistant
app.post('/assistant/chat/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        console.log(`💬 Processing message for ${videoId}: "${message}"`);
        
        const result = await assistant.processMessage(videoId, message);
        res.json(result);
        
    } catch (error) {
        console.error('Failed to process message:', error);
        res.status(500).json({ 
            error: 'Failed to process message',
            response: "I'm having trouble processing that request. Please try again or be more specific about what you'd like to edit."
        });
    }
});

const PORT = process.env.PORT || 5006;
app.listen(PORT, () => {
    console.log(`🤖 AI Assistant (Cerebras +  Llama 4 Maverick) running on port ${PORT}`);
    console.log(`🔗 MCP Video Editor URL: ${MCP_VIDEO_EDITOR_URL}`);
    console.log(`🧠 Cerebras API Key: ${CEREBRAS_API_KEY ? '✅ Configured' : '❌ Missing'}`);
});