import React from 'react';
import ReactPlayer from 'react-player';

function Player({ videoUrl, playerRef }) {
    console.log('Player rendering with URL:', videoUrl);

    return (
        <div 
            className="player-wrapper" 
            style={{ position: 'relative', paddingTop: '56.25%', border: '2px solid red' }} // red border for debugging
        >
            <ReactPlayer
                ref={playerRef}
                className="react-player"
                url={[{ src: videoUrl, type: 'video/mp4' }]}   // 👈 Force MP4 format
                playing={true}
                muted={true}
                controls={true}
                width="100%"
                height="100%"
                style={{ position: 'absolute', top: 0, left: 0 }}
                onReady={() => console.log('✅ onReady: Player is ready.')}
                onError={(e) => console.error('❌ onError:', e)}
            />
        </div>
    );
}

export default Player;
