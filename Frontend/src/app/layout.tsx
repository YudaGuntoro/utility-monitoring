import type { Metadata } from 'next';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';

export const metadata: Metadata = {
  title: {
    default: "Utility Monitoring",
    template: "%s | Utility Monitoring",
  },
  description: "Utility Monitoring power monitoring system",
  icons: {
    apple: "/shms-icon.svg?v=btu-shms-2",
    icon: "/shms-icon.svg?v=btu-shms-2",
    shortcut: "/shms-icon.svg?v=btu-shms-2",
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
        <ThemeProvider>
          <ToastProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
