import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Shell } from "@/components/Shell";
import { HomeProvider } from "@/components/useHome";
import "./globals.css";

const defaultFont = localFont({
	src: [
		{ path: "./fonts/NeueMontreal-Regular.woff2", weight: "400", style: "normal" },
		{ path: "./fonts/NeueMontreal-Italic.woff2", weight: "400", style: "italic" },
		{ path: "./fonts/NeueMontreal-Medium.woff2", weight: "500", style: "normal" },
		{ path: "./fonts/NeueMontreal-MediumItalic.woff2", weight: "500", style: "italic" },
		{ path: "./fonts/NeueMontreal-Bold.woff2", weight: "700", style: "normal" },
		{ path: "./fonts/NeueMontreal-BoldItalic.woff2", weight: "700", style: "italic" },
	],
	fallback: ["sans-serif"],
});

export const metadata: Metadata = {
	title: "Antinet home site",
	description: "A camera and a power plug on the local anet service",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={defaultFont.className}>
			<body className="light" suppressHydrationWarning>
				<HomeProvider>
					<Shell>{children}</Shell>
				</HomeProvider>
			</body>
		</html>
	);
}
