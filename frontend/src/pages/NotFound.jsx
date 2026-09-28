import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 460, margin: '40px auto' }}>
      <div className="card-body">
        <Empty icon="🧭" title="Page not found" hint="The page you requested does not exist." />
        <div className="right">
          <Link className="btn btn-primary" to="/">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
