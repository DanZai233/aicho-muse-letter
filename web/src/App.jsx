import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AccountNav from './components/AccountNav.jsx';
import FeedbackWidget from './components/FeedbackWidget.jsx';

const ConnectPage = lazy(() => import('./pages/ConnectPage.jsx'));
const PaperSentPage = lazy(() => import('./pages/PaperSentPage.jsx'));
const PaperPage = lazy(() => import('./pages/PaperPage.jsx'));

const WritePage = lazy(() => import('./pages/WritePage.jsx'));
const InboxPage = lazy(() => import('./pages/InboxPage.jsx'));
const LetterPage = lazy(() => import('./pages/LetterPage.jsx'));
const SharePage = lazy(() => import('./pages/SharePage.jsx'));

export default function App() {
  return (
    <div className="app">
      <AccountNav />
      <Suspense fallback={<p className="empty-hint">正在展开信笺…</p>}>
        <Routes>
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/paper/sent" element={<PaperSentPage />} />
          <Route path="/paper" element={<PaperPage />} />
          <Route path="/" element={<WritePage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/letter/:id" element={<LetterPage />} />
          <Route path="/l/:token" element={<SharePage />} />
          <Route path="*" element={<WritePage />} />
        </Routes>
      </Suspense>
      <footer className="app-footer">
        <a className="footer-link" href="/paper">纸上逢 · 真人慢邮</a>
        <span className="footer-sep">·</span>
        <span>意见反馈：</span>
        <a className="footer-link" href="mailto:932351233@qq.com">邮箱 932351233@qq.com</a>
        <span className="footer-sep">·</span>
        <span>QQ 932351233</span>
      </footer>
      <FeedbackWidget />
    </div>
  );
}
