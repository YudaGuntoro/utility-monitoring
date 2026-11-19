import type { Metadata } from 'next';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import BrowserIcon from '@/components/brand/BrowserIcon';

export const metadata: Metadata = {
  title: {
    default: "Utility Monitoring System",
    template: "%s | Utility Monitoring System",
  },
  description: "Utility Monitoring System dashboard",
  icons: {
    apple: "/utility-icon.svg?v=utility-system",
    icon: "/utility-icon.svg?v=utility-system",
    shortcut: "/utility-icon.svg?v=utility-system",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-outfit dark:bg-gray-900">
        <BrowserIcon />
        <ThemeProvider>
          <ToastProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
