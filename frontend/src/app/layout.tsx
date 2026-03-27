import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import SimulatorToggle from './SimulatorToggle';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Nexus WMS Event-Driven',
  description: 'Warehouse Management System Simulator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased selection:bg-indigo-500/30`}>
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950"></div>

        <nav className="border-b border-white/10 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 w-full">
              <div className="flex items-center space-x-12">
                <div className="flex-shrink-0">
                  <span className="text-2xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent drop-shadow-sm">
                    NexusWMS
                  </span>
                </div>
                <div className="hidden md:flex space-x-1">
                  <NavLink href="/inventory" label="Inventory & Inbound" activeColor="text-blue-400" />
                  <NavLink href="/orders" label="Orders" activeColor="text-amber-400" />
                  <NavLink href="/picking" label="Picking Tasks" activeColor="text-green-400" />
                  <NavLink href="/shipping" label="Shipping & Dispatch" activeColor="text-purple-400" />
                  <NavLink href="/status" label="System Status" activeColor="text-cyan-400" />
                </div>
              </div>

              {/* Simulator Auto-Toggle */}
              <div className="flex items-center ml-auto">
                <SimulatorToggle />
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}

function NavLink({ href, label, activeColor }: { href: string; label: string; activeColor: string }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all duration-300 relative group`}
    >
      {label}
      <span className={`absolute inset-x-4 -bottom-[1.1rem] h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-100 transition-opacity ${activeColor}`}></span>
    </Link>
  );
}
