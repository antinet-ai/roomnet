"use client";

import { faGaugeHigh, faListCheck, faPlug, faTableColumns } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AntinetMark } from "./AntinetMark";
import { useHome } from "./useHome";

type Theme = "light" | "dark";

const navigation = [
	{ name: "Overview", href: "/", icon: faTableColumns },
	{ name: "Decisions", href: "/decisions", icon: faListCheck },
	{ name: "Sensors", href: "/sensors", icon: faGaugeHigh },
	{ name: "Devices", href: "/devices", icon: faPlug },
];

// The viralway dashboard shell: a 274px sidebar on gray-1 with 38px rows and
// the active pill sliding between them, and the content in a rounded gray-2
// panel with a 16px gutter.
export function Shell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const { state } = useHome();
	const [theme, setTheme] = useState<Theme>("light");
	const [mobileOpen, setMobileOpen] = useState(false);

	useEffect(() => {
		const saved = readSavedTheme();
		setTheme(saved);
		document.body.className = saved;
	}, []);

	const switchTheme = () => {
		const next: Theme = theme === "light" ? "dark" : "light";
		const apply = () => {
			setTheme(next);
			document.body.className = next;
			saveTheme(next);
		};
		if (document.startViewTransition) document.startViewTransition(apply);
		else apply();
	};

	const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
	const pending = state?.pending ?? 0;

	const nav = (
		<nav className="flex flex-col flex-1 min-h-0">
			{navigation.map((item) => (
				<div key={item.href} className="flex relative justify-center items-center mb-[9px] w-full">
					{isActive(item.href) && (
						<motion.div
							transition={{ layout: { type: "tween", duration: 0.15 } }}
							layoutId="navlinks"
							className="absolute h-[38px] w-full rounded-lg pointer-events-none bg-gray-3"
						/>
					)}
					<Link
						href={item.href}
						onClick={() => setMobileOpen(false)}
						className={clsx(
							"relative border border-transparent transition z-3 h-[38px] w-full px-2.5",
							isActive(item.href) ? "bg-transparent pointer-events-none" : "hover:bg-gray-2",
							"flex overflow-hidden justify-start items-center tracking-tight rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-6",
						)}
					>
						<FontAwesomeIcon icon={item.icon} className="text-gray-12 size-[16px]" />
						<p className="ml-2.5 text-sm truncate text-gray-12">{item.name}</p>
						{item.href === "/decisions" && pending > 0 && (
							<p className="ml-auto text-xs font-medium tabular-nums text-gray-11">{pending}</p>
						)}
					</Link>
				</div>
			))}
		</nav>
	);

	const sidebarFooter = (
		<div className="flex flex-col gap-3 pt-3 w-full shrink-0">
			<button
				type="button"
				onClick={switchTheme}
				className="flex items-center px-2.5 h-[38px] w-full rounded-lg text-sm text-gray-11 hover:text-gray-12 hover:bg-gray-2 transition-colors duration-200"
			>
				{theme === "light" ? "Dark mode" : "Light mode"}
			</button>
		</div>
	);

	return (
		<div className="flex h-dvh bg-gray-1">
			<aside className="hidden overflow-hidden relative z-50 h-full lg:flex bg-gray-1 w-[274px] shrink-0">
				<div className="flex flex-col px-4 pt-4 pb-4 h-full w-[274px]">
					<div className="flex items-center gap-2.5 h-[72px] shrink-0 ml-[9px]">
						<AntinetMark className="size-[22px] text-gray-12" />
						<span className="text-sm font-medium text-gray-12">Antinet</span>
					</div>
					{nav}
					{sidebarFooter}
				</div>
			</aside>
			{mobileOpen && (
				<div className="fixed inset-0 z-[60] lg:hidden">
					<button
						type="button"
						aria-label="Close menu"
						className="absolute inset-0 bg-black/60"
						onClick={() => setMobileOpen(false)}
					/>
					<div className="flex absolute inset-y-0 left-0 flex-col p-4 w-[274px] bg-gray-1">
						<div className="flex items-center gap-2.5 h-[72px] shrink-0 ml-[9px]">
							<AntinetMark className="size-[22px] text-gray-12" />
							<span className="text-sm font-medium text-gray-12">Antinet</span>
						</div>
						{nav}
						{sidebarFooter}
					</div>
				</div>
			)}
			<div className="flex overflow-hidden flex-col flex-1 w-full lg:py-4 lg:pr-4">
				<main className="flex overflow-hidden relative flex-col flex-1 min-w-0 h-full border-gray-3 lg:rounded-[20px] lg:border bg-gray-2">
					<div className="flex justify-between items-center px-5 pt-4 shrink-0 lg:hidden">
						<button
							type="button"
							onClick={() => setMobileOpen(true)}
							className="flex justify-center items-center rounded-lg border shadow-xs size-[38px] bg-gray-1 border-gray-4 text-gray-11"
							aria-label="Open menu"
						>
							<AntinetMark className="size-[18px] text-gray-12" />
						</button>
					</div>
					<div className="flex overflow-y-auto relative flex-col flex-1 p-5 pt-3 h-full overscroll-contain lg:px-8 lg:pt-6 lg:pb-8">
						<div className="flex flex-col flex-1 gap-8 min-h-fit">{children}</div>
					</div>
				</main>
			</div>
		</div>
	);
}

function readSavedTheme(): Theme {
	try {
		return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
	} catch {
		return "light";
	}
}

function saveTheme(theme: Theme) {
	try {
		window.localStorage.setItem("theme", theme);
	} catch {
		// Storage can be off in a private window; the theme still applies for this visit.
	}
}
