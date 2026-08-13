import { Routes, Route, Link, NavLink } from 'react-router-dom';
import WritePage from './pages/WritePage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import LetterPage from './pages/LetterPage.jsx';
import SharePage from './pages/SharePage.jsx';

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<WritePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/letter/:id" element={<LetterPage />} />
        <Route path="/l/:token" element={<SharePage />} />
  <Route path="*" element={<WritePage />} />
</Routes>
      <footer className="app-footer">
        <span>意见反馈：</span>
        <a className="footer-link" href="mailto:932351233@qq.com">邮箱 932351233@qq.com</a>
        <span className="footer-sep">·</span>
        <span>QQ 932351233</span>
      </footer>
</div>
);
}
