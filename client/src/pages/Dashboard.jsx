import Banner from '../components/common/Banner.jsx';
import VideoAnalyzer from '../components/video/VideoAnalyzer.jsx';
import useSocket from '../hooks/useSocket.js';

export default function Dashboard() {
  const { socket, connected } = useSocket();

  return (
    <main className="dashboard-shell">
      <header className="page-header">
        <div>
          <span className="eyebrow">VIDEO ANALYSIS</span>
          <h1>ID Card Video Analyzer</h1>
          <p>Upload a recording to review ID-card detections frame by frame.</p>
        </div>
      </header>

      <Banner>{!connected ? 'Connection lost. Reconnecting to the detection server…' : ''}</Banner>
      <VideoAnalyzer socket={socket} connected={connected} />
      <footer>Detection is processed by the configured Roboflow Workflow.</footer>
    </main>
  );
}
