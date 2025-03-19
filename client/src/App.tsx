import { useEffect, useRef, useState } from 'react';
import './App.css';

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function App() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  
  const getStream = function() { return localStreamRef.current };
  const [, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    console.log("asdf", localStream);
  }, [localStream]);

  useEffect(() => {
    // Initialize WebSocket connection
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    wsRef.current = new WebSocket(`${protocol}://${host}${port}/ws`);
    wsRef.current.onmessage = handleSignalingMessage;

    // Get local media stream
    console.log("starting camera")
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        console.log("setting camera stream")
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch((error) => console.error('Error accessing media devices:', error));
      
    return () => {
      localStream?.getTracks().forEach(track => track.stop());
      peerConnectionRef.current?.close();
      wsRef.current?.close();
    };
  }, []);

  const createPeerConnection = () => {
    const localStream = getStream();
    console.log("creating peer connection", localStream)
    console.log("creating peer connection")
    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: 'candidate',
          payload: JSON.stringify(event.candidate)
        });
      }
    };

    peerConnection.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStream) {
      console.log("adding local tracks to connection")
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    } else {
      console.error("no local tracks added")
    }

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  const handleSignalingMessage = async (event: MessageEvent) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'offer': {
        const peerConnection = createPeerConnection();
        await peerConnection.setRemoteDescription(JSON.parse(message.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendMessage({
          type: 'answer',
          payload: JSON.stringify(answer)
        });
        setIsConnected(true);
      }
        break;

      case 'answer':
        await peerConnectionRef.current?.setRemoteDescription(
          JSON.parse(message.payload)
        );
        setIsConnected(true);
        break;

      case 'candidate':
        await peerConnectionRef.current?.addIceCandidate(
          JSON.parse(message.payload)
        );
        break;
    }
  };

  const sendMessage = (message: { type: string; payload: string }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const startCall = async () => {
    const peerConnection = createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage({
      type: 'offer',
      payload: JSON.stringify(offer)
    });
  };

  return (
    <div className="app">
      <div className="videos">
        <div className="video-container">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video local-video"
          />
          <div className="video-label">Local Video</div>
        </div>
        <div className="video-container">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="video remote-video"
          />
          <div className="video-label">Remote Video</div>
        </div>
      </div>
      <div className="controls">
        <button
          onClick={startCall}
          disabled={!localStream || isConnected}
          className="control-button"
        >
          Start Call
        </button>
      </div>
    </div>
  )
}

export default App
