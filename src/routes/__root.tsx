import { installUsageTracker } from "@/lib/usage-tracker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { InstallPrompt } from "@/components/install-prompt";
import { TransferOverlay, BackgroundKeepAlive } from "@/lib/transfer-manager";
import { NativeBootstrap } from "@/components/native-bootstrap";
import { StoragePermissionPrompt } from "@/components/storage-permission-prompt";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير متوفرة أو تم نقلها.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md gradient-brown px-5 py-2.5 text-sm font-medium"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1a0f0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Zircon" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "رحلة سن الزركون - Zircon Journey" },
      { name: "description", content: "نظام إدارة سير العمل الاحترافي لمركز Zircon CAD CAM." },
      { property: "og:title", content: "رحلة سن الزركون - Zircon Journey" },
      { name: "twitter:title", content: "رحلة سن الزركون - Zircon Journey" },
      { property: "og:description", content: "نظام إدارة سير العمل الاحترافي لمركز Zircon CAD CAM." },
      { name: "twitter:description", content: "نظام إدارة سير العمل الاحترافي لمركز Zircon CAD CAM." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7832896a-7b7f-4273-a1d9-9a284b76297f/id-preview-4fc2b00e--b35291ce-dece-4302-89c8-dddfbc70b8d1.lovable.app-1778516991493.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7832896a-7b7f-4273-a1d9-9a284b76297f/id-preview-4fc2b00e--b35291ce-dece-4302-89c8-dddfbc70b8d1.lovable.app-1778516991493.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

if (typeof window !== "undefined") installUsageTracker();

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
      <InstallPrompt />
      <NativeBootstrap />
      <StoragePermissionPrompt />
      <TransferOverlay />
      <BackgroundKeepAlive />
    </QueryClientProvider>
  );
}
