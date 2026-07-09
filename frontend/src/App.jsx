import { useState } from "react";
import NavBar from "./components/NavBar.jsx";
import Screener from "./views/Screener.jsx";
import Tracker from "./views/Tracker.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("screener");

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <NavBar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1">
        {activeTab === "screener" ? <Screener /> : <Tracker />}
      </main>
    </div>
  );
}
