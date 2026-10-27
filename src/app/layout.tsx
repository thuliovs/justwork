import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "justwork · Radar", template: "%s · justwork" },
  description: "Radar pessoal de vagas de Software Engineering",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>
        <header className="site-header">
          <div className="header-inner"><Link className="brand" href="/">just<span>work</span></Link><nav aria-label="Navegação principal"><Link href="/">Radar</Link><Link href="/applications">Candidaturas</Link><Link href="/sources">Fontes</Link></nav></div>
        </header>
        {children}
      </body>
    </html>
  );
}
