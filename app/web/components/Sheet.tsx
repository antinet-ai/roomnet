"use client";

import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

/** A device's controls over the page: from the bottom on a phone, centred on a wide screen. Escape or the backdrop closes it. */
export function Sheet({
	open,
	title,
	subtitle,
	onClose,
	children,
}: {
	open: boolean;
	title: string;
	subtitle?: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	useEffect(() => {
		if (!open) return;
		const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open && (
				<div className="flex fixed inset-0 z-[70] justify-center items-end sm:items-center">
					<motion.button
						type="button"
						aria-label="Close"
						className="absolute inset-0 bg-black/40 backdrop-blur-sm"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-label={title}
						className="flex overflow-y-auto relative flex-col gap-6 p-6 w-full sm:max-w-md max-h-[92dvh] rounded-t-[28px] sm:rounded-[28px] bg-gray-1 shadow-2xl"
						initial={{ y: 40, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 40, opacity: 0 }}
						transition={{ type: "spring", damping: 30, stiffness: 380 }}
					>
						<div className="flex gap-4 justify-between items-start">
							<div className="flex flex-col gap-0.5 min-w-0">
								<h2 className="text-xl font-medium truncate text-gray-12">{title}</h2>
								{subtitle && <p className="text-sm text-gray-10">{subtitle}</p>}
							</div>
							<button
								type="button"
								onClick={onClose}
								aria-label="Close"
								className="flex justify-center items-center rounded-full transition-colors duration-200 size-8 shrink-0 bg-gray-3 text-gray-11 hover:bg-gray-4"
							>
								<FontAwesomeIcon icon={faXmark} className="size-[14px]" />
							</button>
						</div>
						{children}
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
