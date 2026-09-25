import React from 'react';

export const metadata = {
  title: 'DFL-One Enterprise Workspace Shell',
  description: 'Certified Modular Product Composition Shell for DFL Enterprise'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
          }
          a { color: inherit; text-decoration: none; }
          * { box-sizing: border-box; }
        `}</style>
      </head>
      <body>
        <div id="dfl-one-root">
          {children}
        </div>
      </body>
    </html>
  );
}
