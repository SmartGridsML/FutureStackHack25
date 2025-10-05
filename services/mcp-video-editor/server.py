import asyncio
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Any
import threading

from mcp.server import Server
from mcp.types import Tool, TextContent, CallToolRequest  # 🔧 Add CallToolRequest import
from flask import Flask, request, jsonify

# MCP Server
server = Server("cerebras-video-editor")

@server.list_tools()
async def list_tools() -> List[Tool]:
    """List all available video editing tools"""
    return [
        Tool(
            name="remove_filler_words",
            description="Remove filler words (um, uh, er, like) from video based on transcript analysis",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_path": {"type": "string", "description": "Path to input video file"},
                    "output_path": {"type": "string", "description": "Path for cleaned output video"},
                    "filler_segments": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "start": {"type": "number", "description": "Start time in seconds"},
                                "end": {"type": "number", "description": "End time in seconds"},
                                "word": {"type": "string", "description": "Filler word to remove"}
                            }
                        },
                        "description": "Array of filler word segments to remove"
                    }
                },
                "required": ["video_path", "output_path", "filler_segments"]
            }
        ),
        Tool(
            name="trim_silence",
            description="Remove long pauses and silence gaps from video",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_path": {"type": "string"},
                    "output_path": {"type": "string"},
                    "silence_segments": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "start": {"type": "number"},
                                "end": {"type": "number"},
                                "duration": {"type": "number"}
                            }
                        }
                    },
                    "min_silence_duration": {"type": "number", "default": 1.5}
                },
                "required": ["video_path", "output_path", "silence_segments"]
            }
        ),
        Tool(
            name="create_highlight_reel",
            description="Extract and combine the most engaging video segments",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_path": {"type": "string"},
                    "output_path": {"type": "string"},
                    "highlights": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "start": {"type": "number"},
                                "end": {"type": "number"},
                                "description": {"type": "string"},
                                "engagement_score": {"type": "number", "minimum": 0, "maximum": 1}
                            }
                        }
                    },
                    "target_duration": {"type": "number"},
                    "fade_duration": {"type": "number", "default": 0.5}
                },
                "required": ["video_path", "output_path", "highlights", "target_duration"]
            }
        ),
        Tool(
            name="enhance_audio",
            description="Normalize audio levels, reduce background noise, and enhance speech clarity",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_path": {"type": "string"},
                    "output_path": {"type": "string"},
                    "normalize_audio": {"type": "boolean", "default": True},
                    "reduce_noise": {"type": "boolean", "default": True},
                    "target_loudness": {"type": "number", "default": -23}
                },
                "required": ["video_path", "output_path"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
    """Route tool calls to appropriate handlers"""
    try:
        if name == "remove_filler_words":
            return await remove_filler_words(**arguments)
        elif name == "trim_silence":
            return await trim_silence(**arguments)
        elif name == "create_highlight_reel":
            return await create_highlight_reel(**arguments)
        elif name == "enhance_audio":
            return await enhance_audio(**arguments)
        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error executing {name}: {str(e)}")]

async def remove_filler_words(video_path: str, output_path: str, filler_segments: List[Dict]) -> List[TextContent]:
    """Remove filler words using precise FFmpeg cuts"""
    try:
        if not os.path.exists(video_path):
            return [TextContent(type="text", text=f"Input video not found: {video_path}")]
        
        segments = sorted(filler_segments, key=lambda x: x['start'])
        
        if not segments:
            cmd = ['ffmpeg', '-i', video_path, '-c', 'copy', '-y', output_path]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                return [TextContent(type="text", text=f"No filler words found. Original video copied to {output_path}")]
            else:
                return [TextContent(type="text", text=f"Copy failed: {result.stderr}")]
        
        # Build complex filter to remove segments
        filter_parts = []
        current_time = 0.0
        part_count = 0
        
        for segment in segments:
            if current_time < segment['start']:
                filter_parts.append(f"[0:v]trim={current_time}:{segment['start']},setpts=PTS-STARTPTS[v{part_count}];")
                filter_parts.append(f"[0:a]atrim={current_time}:{segment['start']},asetpts=PTS-STARTPTS[a{part_count}];")
                part_count += 1
            current_time = segment['end']
        
        if current_time < 999999:
            filter_parts.append(f"[0:v]trim={current_time},setpts=PTS-STARTPTS[v{part_count}];")
            filter_parts.append(f"[0:a]atrim={current_time},asetpts=PTS-STARTPTS[a{part_count}];")
            part_count += 1
        
        if part_count == 0:
            return [TextContent(type="text", text="No valid segments to keep")]
        
        video_inputs = "".join([f"[v{i}]" for i in range(part_count)])
        audio_inputs = "".join([f"[a{i}]" for i in range(part_count)])
        concat_filter = f"{video_inputs}concat=n={part_count}:v=1:a=0[outv];{audio_inputs}concat=n={part_count}:v=0:a=1[outa]"
        
        filter_complex = "".join(filter_parts) + concat_filter
        
        cmd = [
            'ffmpeg', '-i', video_path,
            '-filter_complex', filter_complex,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-y', output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            saved_time = sum(seg['end'] - seg['start'] for seg in segments)
            filler_count = len(segments)
            return [TextContent(type="text", text=f"✅ Successfully removed {filler_count} filler words, saving {saved_time:.1f} seconds. Output: {output_path}")]
        else:
            return [TextContent(type="text", text=f"❌ FFmpeg error: {result.stderr[-500:]}")]
            
    except Exception as e:
        return [TextContent(type="text", text=f"❌ Error: {str(e)}")]

async def trim_silence(video_path: str, output_path: str, silence_segments: List[Dict], min_silence_duration: float = 1.5) -> List[TextContent]:
    """Remove silence gaps longer than threshold"""
    try:
        long_silences = [seg for seg in silence_segments if seg['duration'] >= min_silence_duration]
        
        if not long_silences:
            cmd = ['ffmpeg', '-i', video_path, '-c', 'copy', '-y', output_path]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                return [TextContent(type="text", text=f"No long silences found (>{min_silence_duration}s). Video copied to {output_path}")]
            else:
                return [TextContent(type="text", text=f"Copy failed: {result.stderr}")]
        
        segments = sorted(long_silences, key=lambda x: x['start'])
        filter_parts = []
        current_time = 0.0
        part_count = 0
        
        for segment in segments:
            if current_time < segment['start']:
                filter_parts.append(f"[0:v]trim={current_time}:{segment['start']},setpts=PTS-STARTPTS[v{part_count}];")
                filter_parts.append(f"[0:a]atrim={current_time}:{segment['start']},asetpts=PTS-STARTPTS[a{part_count}];")
                part_count += 1
            current_time = segment['end']
        
        if current_time < 999999:
            filter_parts.append(f"[0:v]trim={current_time},setpts=PTS-STARTPTS[v{part_count}];")
            filter_parts.append(f"[0:a]atrim={current_time},asetpts=PTS-STARTPTS[a{part_count}];")
            part_count += 1
        
        if part_count == 0:
            return [TextContent(type="text", text="No valid segments to keep")]
        
        video_inputs = "".join([f"[v{i}]" for i in range(part_count)])
        audio_inputs = "".join([f"[a{i}]" for i in range(part_count)])
        concat_filter = f"{video_inputs}concat=n={part_count}:v=1:a=0[outv];{audio_inputs}concat=n={part_count}:v=0:a=1[outa]"
        
        filter_complex = "".join(filter_parts) + concat_filter
        
        cmd = [
            'ffmpeg', '-i', video_path,
            '-filter_complex', filter_complex,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-y', output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            saved_time = sum(seg['duration'] for seg in long_silences)
            return [TextContent(type="text", text=f"✅ Trimmed {len(long_silences)} silence gaps, saving {saved_time:.1f} seconds. Output: {output_path}")]
        else:
            return [TextContent(type="text", text=f"❌ FFmpeg error: {result.stderr[-500:]}")]
            
    except Exception as e:
        return [TextContent(type="text", text=f"❌ Error: {str(e)}")]

async def create_highlight_reel(video_path: str, output_path: str, highlights: List[Dict], target_duration: float, fade_duration: float = 0.5) -> List[TextContent]:
    try:
        print(f"Video path: {video_path}")
        print(f"File exists: {os.path.exists(video_path)}")
        if os.path.exists(video_path):
            print(f"File size: {os.path.getsize(video_path)}")
        
        print(f"Highlights: {highlights}")
        
        sorted_highlights = sorted(highlights, key=lambda x: x.get('engagement_score', 0), reverse=True)
        
        selected_clips = []
        current_duration = 0
        
        for highlight in sorted_highlights:
            clip_duration = highlight['end'] - highlight['start']
            if current_duration + clip_duration <= target_duration:
                selected_clips.append(highlight)
                current_duration += clip_duration
                
                if current_duration >= target_duration * 0.95:
                    break
        
        print(f"Selected clips: {selected_clips}")
        
        if not selected_clips:
            return [TextContent(type="text", text="No highlights found that fit the target duration")]
        
        temp_clips = []
        for i, clip in enumerate(selected_clips):
            temp_clip = f"/tmp/highlight_{i}.mp4"
            temp_clips.append(temp_clip)
            
            cmd = [
                'ffmpeg', '-i', video_path,
                '-ss', str(clip['start']),
                '-t', str(clip['end'] - clip['start']),
                '-vf', f'fade=t=in:st=0:d={fade_duration},fade=t=out:st={clip["end"] - clip["start"] - fade_duration}:d={fade_duration}',
                '-af', f'afade=t=in:st=0:d={fade_duration},afade=t=out:st={clip["end"] - clip["start"] - fade_duration}:d={fade_duration}',
                '-y', temp_clip
            ]
            
            print(f"Extract command for clip {i}: {' '.join(cmd)}")
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return [TextContent(type="text", text=f"Failed to extract clip {i}: {result.stderr}")]
        
        concat_file = "/tmp/highlight_concat.txt"
        with open(concat_file, 'w') as f:
            for clip in temp_clips:
                f.write(f"file '{clip}'\n")
        
        cmd = [
            'ffmpeg', '-f', 'concat', '-safe', '0', '-i', concat_file,
            '-c', 'copy', '-y', output_path
        ]
        
        print(f"Concat command: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Cleanup
        for temp_clip in temp_clips:
            try:
                os.remove(temp_clip)
            except:
                pass
        try:
            os.remove(concat_file)
        except:
            pass
        
        if result.returncode == 0:
            return [TextContent(type="text", text=f"✅ Created {len(selected_clips)}-clip highlight reel ({current_duration:.1f}s). Output: {output_path}")]
        else:
            return [TextContent(type="text", text=f"❌ Concatenation failed: {result.stderr}")]
            
    except Exception as e:
        return [TextContent(type="text", text=f"❌ Error: {str(e)}")]

async def enhance_audio(video_path: str, output_path: str, normalize_audio: bool = True, reduce_noise: bool = True, target_loudness: float = -23) -> List[TextContent]:
    """Enhance audio quality"""
    try:
        filters = []
        
        if reduce_noise:
            filters.append("highpass=f=200")
            filters.append("lowpass=f=3000")
        
        if normalize_audio:
            filters.append(f"loudnorm=I={target_loudness}:TP=-1:LRA=7")
        
        audio_filter = ",".join(filters) if filters else "copy"
        
        cmd = [
            'ffmpeg', '-i', video_path,
            '-c:v', 'copy',
            '-af', audio_filter,
            '-c:a', 'aac', '-b:a', '128k',
            '-y', output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            enhancements = []
            if normalize_audio:
                enhancements.append("normalized loudness")
            if reduce_noise:
                enhancements.append("reduced noise")
            
            return [TextContent(type="text", text=f"✅ Enhanced audio: {', '.join(enhancements)}. Output: {output_path}")]
        else:
            return [TextContent(type="text", text=f"❌ Audio enhancement failed: {result.stderr[-300:]}")]
            
    except Exception as e:
        return [TextContent(type="text", text=f"❌ Error: {str(e)}")]

# Flask HTTP wrapper (this is what we'll actually use)
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "server": "cerebras-video-editor", "mode": "http-only"})

@app.route('/tools', methods=['GET'])
def get_tools():
    """Get available tools via HTTP"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        tools = loop.run_until_complete(server.list_tools())
        return jsonify([{
            "name": tool.name,
            "description": tool.description,
            "schema": tool.inputSchema
        } for tool in tools])
    finally:
        loop.close()

@app.route('/execute', methods=['POST'])
def execute_tool():
    """Execute a tool via HTTP"""
    data = request.json
    tool_name = data.get('tool_name')
    arguments = data.get('arguments', {})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Call the actual call_tool function directly, not through the server decorator
        result = loop.run_until_complete(call_tool(tool_name, arguments))
        return jsonify({
            "success": True,
            "result": [content.text if hasattr(content, 'text') else str(content) for content in result]
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
    finally:
        loop.close()


if __name__ == "__main__":
    print("🎬 MCP Video Editor starting (HTTP-only mode)...")
    print("📡 HTTP API available on port 5007")
    print("🛠️  Available tools: remove_filler_words, trim_silence, create_highlight_reel, enhance_audio")
    
    # Only run Flask HTTP server
    app.run(host='0.0.0.0', port=5007, debug=False)