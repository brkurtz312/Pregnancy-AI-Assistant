// BottomBar.tsx
import { Link } from "react-router-dom";

export function BottomBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-xs sm:text-sm">
        {/* existing buttons */}
        {/* ... */}

        {/* New prenatal prep button */}
        <Link
          to="/prenatal-prep"
          className="inline-flex items-center rounded-full bg-rose-600 px-3 py-1 font-semibold hover:bg-rose-700"
        >
          Prepare for prenatal visits
        </Link>
      </div>
    </nav>
  );
}
