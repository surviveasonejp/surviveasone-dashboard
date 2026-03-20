import { type FC } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";

export const Layout: FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};
