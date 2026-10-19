import { Bookmark } from 'lucide-react';
import { memo, useState } from 'react';
import BookmarksModal from './Bookmarks';

const Footer = memo(() => {
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);

  return (
    <div className="w-full fixed bottom-0 flex justify-end p-2">
      <button
        type="button"
        className="flex gap-1 items-center hover:-translate-y-0.5 duration-200"
        onClick={() => setIsBookmarksOpen(true)}
      >
        <Bookmark className="w-4" /> Bookmarks
      </button>
      <BookmarksModal isOpen={isBookmarksOpen} onClose={() => setIsBookmarksOpen(false)} />
    </div>
  );
});

Footer.displayName = 'Footer';
export default Footer;
