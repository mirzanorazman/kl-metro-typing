import './mobile.css';

export function PhoneLandscapeBlock({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <p role="status" className={`phone-landscape-block${fullScreen ? ' phone-landscape-block--full' : ''}`}>
      Rotate to portrait to play
    </p>
  );
}
