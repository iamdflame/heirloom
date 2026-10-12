import { StrictMode, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// A transition render is time-sliced: the first paint of a long page doesn't block the main thread for one long task.
const root = createRoot(document.getElementById('root')!);
startTransition(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
