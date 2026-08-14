import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="nf-page">
      <div className="nf-wrap">
        <div className="nf-code">404</div>
        <h1 className="nf-title">Page not found</h1>
        <p className="nf-msg">The page you are looking for does not exist or has been moved.</p>
        <Link to="/" className="nf-link">Back to Dashboard</Link>
      </div>
    </div>
  );
}