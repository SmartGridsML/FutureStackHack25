import React from 'react';
import ReactPlayer from 'react-player';

// Pass the ref to ReactPlayer
function Player({ videoUrl, playerRef }) {
    console.log('Player component received videoUrl:', videoUrl);
    
    const handlePlayerError = (e) => {
        console.error('ReactPlayer error:', e);
    };

    return (
        <div className="player-wrapper" style={{ position: 'relative', paddingTop: '56.25%' }}>
            <ReactPlayer
                ref={playerRef}
                className="react-player"
                url={videoUrl}
                controls={true}
                width="100%"
                height="100%"
                style={{ position: 'absolute', top: 0, left: 0 }}
                onError={handlePlayerError}
            />
        </div>
    );
}

export default Player;